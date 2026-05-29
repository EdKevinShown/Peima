/**
 * M6.2-r2 — Read-only aggregate of `match_results.match_insights.rrmDecisionShadow`.
 * - No DB writes. No userId / matchResultId / conversationId in stdout.
 *
 * Run from monorepo root:
 *   node --env-file=.env packages/database/scripts/m6-r2-shadow-evaluation-summary.mjs --limit 20 --pretty
 *
 * CLI (current):
 *   --limit <n>     Max MatchResult rows to scan (most recent first). Default: 500.
 *   --since <date>  ISO date or YYYY-MM-DD; filter createdAt >= start of that UTC day.
 *   --pretty        Pretty-print JSON to stdout.
 *   --json          Single-line JSON (default if neither --pretty nor --json: pretty for humans).
 *
 * If DB connection fails, the process exits non-zero (only case where we allow throw from Prisma connect).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

const SUMMARY_SCHEMA_VERSION = 1;
const SUMMARY_SOURCE_TYPE = "rrm_decision_shadow_evaluation_summary";
const SUMMARY_SOURCE_VERSION = "m6.2-rrm-decision-shadow-eval-v1";

const DECISIONS = new Set([
  "same_as_baseline",
  "switch_to_top2_candidate",
  "no_shadow_decision",
]);

const MISSING_INPUT = new Set([
  "missing_score_shadow_v2",
  "missing_rrm_v2_top2_selector",
  "empty_selected_top2",
]);

const CONTEXT_BLOCKED = new Set([
  "has_low_band",
  "has_strong_conflict_band",
  "any_below_suggested_floor",
  "top2_gap_large",
]);

const INVALID_SELECTOR = new Set([
  "invalid_selector_payload",
  "parse_error",
  "reason_not_ok",
  "eligible_not_true",
]);

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function isRecord(x) {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function parseArgs(argv) {
  let limit = 500;
  let since = null;
  let pretty = false;
  let jsonOneLine = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(0, parseInt(String(argv[++i]), 10) || 0);
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(0, parseInt(a.split("=")[1], 10) || 0);
    } else if (a === "--since" && argv[i + 1]) {
      since = String(argv[++i]).trim();
    } else if (a.startsWith("--since=")) {
      since = a.slice("--since=".length).trim();
    } else if (a === "--pretty") {
      pretty = true;
    } else if (a === "--json") {
      jsonOneLine = true;
    }
  }
  return { limit, since, pretty, jsonOneLine };
}

function sinceToDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00.000Z`);
  }
  return null;
}

function safeStringArray(x) {
  if (!Array.isArray(x)) return [];
  return x.filter((t) => typeof t === "string" && t.length > 0);
}

function extractShadowRow(matchInsights) {
  if (!isRecord(matchInsights)) {
    return { rowKind: "malformed_insights", shadow: null };
  }
  const raw = matchInsights.rrmDecisionShadow;
  if (raw == null) {
    return { rowKind: "no_shadow", shadow: null };
  }
  if (!isRecord(raw)) {
    return { rowKind: "shadow_malformed", shadow: null };
  }
  const shadowBlock = isRecord(raw.shadow) ? raw.shadow : null;
  const decisionRaw =
    shadowBlock && typeof shadowBlock.decision === "string" ? shadowBlock.decision.trim() : null;
  const decision =
    decisionRaw && DECISIONS.has(decisionRaw) ? decisionRaw : "unknown";

  const reasonCode =
    shadowBlock &&
    typeof shadowBlock.reasonCode === "string" &&
    shadowBlock.reasonCode.trim().length > 0
      ? shadowBlock.reasonCode.trim()
      : "unknown";

  const gr = isRecord(raw.guardrails) ? raw.guardrails : null;
  const blocked = Boolean(gr && gr.blocked === true);
  const blockReasons = safeStringArray(gr?.blockReasons);

  const ip = isRecord(raw.inputPresence) ? raw.inputPresence : null;

  return {
    rowKind: "has_shadow",
    shadow: {
      decision,
      reasonCode,
      blocked,
      blockReasons,
      inputPresence: {
        scoreShadowV2: ip ? ip.scoreShadowV2 === true : false,
        rrmV2Top2Selector: ip ? ip.rrmV2Top2Selector === true : false,
        selectedTop2: ip ? ip.selectedTop2 === true : false,
        scoreShadowV1LegacyPresent: ip ? ip.scoreShadowV1LegacyPresent === true : false,
      },
    },
  };
}

function divRate(num, den) {
  if (den == null || den <= 0) return null;
  return num / den;
}

function buildSummary(rows) {
  let malformedInsightsCount = 0;
  let shadowMalformedCount = 0;
  let parseErrorCount = 0;

  const decisionDistribution = {
    same_as_baseline: 0,
    switch_to_top2_candidate: 0,
    no_shadow_decision: 0,
    unknown: 0,
  };
  const reasonCodeDistribution = {};
  const blockReasonDistribution = {};
  const inputPresenceSummary = {
    scoreShadowV2True: 0,
    rrmV2Top2SelectorTrue: 0,
    selectedTop2True: 0,
    scoreShadowV1LegacyPresentTrue: 0,
  };

  let N_total = 0;
  let N_shadow = 0;
  let N_validShadow = 0;
  let noShadowDecision = 0;
  let sameAsBaseline = 0;
  let switchSuggested = 0;
  let blockedTrue = 0;
  let missingInputRows = 0;
  let contextBlockedRows = 0;
  let invalidSelectorRows = 0;
  let unexpectedExceptionRows = 0;
  let v1LegacyRows = 0;

  for (const row of rows) {
    N_total++;
    const mi = row.matchInsights;
    const extracted = extractShadowRow(mi);

    if (extracted.rowKind === "malformed_insights") {
      malformedInsightsCount++;
      continue;
    }
    if (extracted.rowKind === "no_shadow") {
      continue;
    }
    if (extracted.rowKind === "shadow_malformed") {
      shadowMalformedCount++;
      parseErrorCount++;
      N_shadow++;
      decisionDistribution.unknown++;
      bump(reasonCodeDistribution, "unknown");
      continue;
    }

    const { shadow } = extracted;
    N_shadow++;

    if (shadow.decision === "unknown") parseErrorCount++;

    decisionDistribution[shadow.decision] = (decisionDistribution[shadow.decision] ?? 0) + 1;
    bump(reasonCodeDistribution, shadow.reasonCode);

    for (const br of shadow.blockReasons) {
      bump(blockReasonDistribution, br);
    }

    if (shadow.inputPresence.scoreShadowV2) inputPresenceSummary.scoreShadowV2True++;
    if (shadow.inputPresence.rrmV2Top2Selector) inputPresenceSummary.rrmV2Top2SelectorTrue++;
    if (shadow.inputPresence.selectedTop2) inputPresenceSummary.selectedTop2True++;
    if (shadow.inputPresence.scoreShadowV1LegacyPresent) inputPresenceSummary.scoreShadowV1LegacyPresentTrue++;

    if (shadow.decision === "same_as_baseline" || shadow.decision === "switch_to_top2_candidate") {
      N_validShadow++;
    }
    if (shadow.decision === "no_shadow_decision") noShadowDecision++;
    if (shadow.decision === "same_as_baseline") sameAsBaseline++;
    if (shadow.decision === "switch_to_top2_candidate") switchSuggested++;

    if (shadow.blocked) blockedTrue++;

    if (shadow.blockReasons.some((r) => MISSING_INPUT.has(r))) missingInputRows++;
    if (shadow.blockReasons.some((r) => CONTEXT_BLOCKED.has(r))) contextBlockedRows++;
    if (shadow.blockReasons.some((r) => INVALID_SELECTOR.has(r))) invalidSelectorRows++;
    if (shadow.blockReasons.includes("unexpected_exception")) unexpectedExceptionRows++;

    if (shadow.inputPresence.scoreShadowV1LegacyPresent) v1LegacyRows++;
  }

  const rates = {
    shadowCoverageRate: divRate(N_shadow, N_total) ?? 0,
    validShadowRate: N_shadow > 0 ? divRate(N_validShadow, N_shadow) ?? 0 : null,
    noShadowDecisionRate: N_shadow > 0 ? divRate(noShadowDecision, N_shadow) ?? 0 : null,
    sameAsBaselineRate: N_shadow > 0 ? divRate(sameAsBaseline, N_shadow) ?? 0 : null,
    switchSuggestedRate: N_shadow > 0 ? divRate(switchSuggested, N_shadow) ?? 0 : null,
    blockedRate: N_shadow > 0 ? divRate(blockedTrue, N_shadow) ?? 0 : null,
    missingInputRate: N_shadow > 0 ? divRate(missingInputRows, N_shadow) ?? 0 : null,
    contextBlockedRate: N_shadow > 0 ? divRate(contextBlockedRows, N_shadow) ?? 0 : null,
    invalidSelectorRate: N_shadow > 0 ? divRate(invalidSelectorRows, N_shadow) ?? 0 : null,
    unexpectedExceptionRate: N_shadow > 0 ? divRate(unexpectedExceptionRows, N_shadow) ?? 0 : null,
    v1LegacyPresenceRate: divRate(v1LegacyRows, N_total) ?? 0,
  };

  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    sourceType: SUMMARY_SOURCE_TYPE,
    sourceVersion: SUMMARY_SOURCE_VERSION,
    sampleSize: N_total,
    shadowCount: N_shadow,
    validShadowCount: N_validShadow,
    rates,
    decisionDistribution,
    reasonCodeDistribution,
    blockReasonDistribution,
    inputPresenceSummary,
    malformedInsightsCount,
    shadowMalformedCount,
    parseErrorCount,
    malformedCount: malformedInsightsCount + shadowMalformedCount,
    generatedAt: new Date().toISOString(),
  };
}

function bump(map, key) {
  const k = key || "unknown";
  map[k] = (map[k] ?? 0) + 1;
}

async function main() {
  tryLoadMonorepoDotEnv();
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, reason: "DATABASE_URL_missing" }));
    process.exit(1);
  }

  const { limit, since, pretty, jsonOneLine } = parseArgs(process.argv.slice(2));
  const sinceDate = since ? sinceToDate(since) : null;
  if (since && !sinceDate) {
    console.error(JSON.stringify({ ok: false, reason: "invalid_since", since }));
    process.exit(1);
  }

  const take = limit > 0 ? limit : 500;
  const prisma = new PrismaClient();
  let rows;
  try {
    const where = {};
    if (sinceDate) where.createdAt = { gte: sinceDate };
    rows = await prisma.matchResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        matchInsights: true,
        createdAt: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  const summary = buildSummary(rows);
  const space = pretty || !jsonOneLine ? 2 : 0;
  const out = JSON.stringify(summary, null, space === 0 ? undefined : space);
  process.stdout.write(out + "\n");
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, reason: "fatal", message: String(e?.message ?? e) }));
  process.exit(1);
});
