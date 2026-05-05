/**
 * M6.7-C1 — RRM debug observation snapshot (read-only).
 *
 * Run from monorepo root:
 *   node --env-file=.env packages/database/scripts/m6-r7-rrm-observation-snapshot.mjs --limit 50 --pretty
 *
 * CLI:
 *   --limit <n>     Max MatchResult rows to scan (most recent first). Default: 50.
 *   --since <date>  Optional ISO date or YYYY-MM-DD (createdAt >= since).
 *   --pretty        Pretty JSON output.
 *   --json          Single-line JSON output.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

const DECISION_SHADOW_KEYS = [
  "same_as_baseline",
  "switch_to_top2_candidate",
  "no_shadow_decision",
  "blocked",
  "unexpected_exception",
];

const BOUNDED_DECISION_KEYS = [
  "would_use_baseline",
  "would_switch_to_rrm",
  "fallback_baseline",
];

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\n/)) {
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

function toBool(v) {
  return v === true;
}

function bump(map, key) {
  const k = typeof key === "string" && key.trim().length > 0 ? key.trim() : "unknown";
  map[k] = (map[k] ?? 0) + 1;
}

function parseArgs(argv) {
  let limit = 50;
  let since = null;
  let pretty = false;
  let jsonOneLine = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(0, parseInt(String(argv[++i]), 10) || 0);
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
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

function createSummarySkeleton(sampleSize) {
  return {
    sampleSize,
    withScoreShadowV2: 0,
    withScoreShadowV1Legacy: 0,
    withRrmV2Top2Selector: 0,
    withRrmDecisionShadow: 0,
    withRrmBoundedDecision: 0,
    withResolvedProjectionUnavailableInDbNote: true,
    decisionShadow: Object.fromEntries(DECISION_SHADOW_KEYS.map((k) => [k, 0])),
    boundedDecision: {
      would_use_baseline: 0,
      would_switch_to_rrm: 0,
      fallback_baseline: 0,
      fallbackReasonDistribution: {},
    },
    inputPresence: {
      scoreShadowV2True: 0,
      rrmV2Top2SelectorTrue: 0,
      selectedTop2True: 0,
      scoreShadowV1LegacyPresentTrue: 0,
    },
    quality: {
      malformedCount: 0,
      parseErrorCount: 0,
      unexpectedExceptionCount: 0,
    },
    notes: [
      "resolved projection is API runtime projection and is not directly persisted in DB",
      "handoff mismatch / owner warning are mostly runtime UI signals and may not be directly aggregatable from DB",
    ],
    generatedAt: new Date().toISOString(),
  };
}

function observeDecisionShadow(summary, insights) {
  const dsRaw = insights.rrmDecisionShadow;
  if (dsRaw == null) return;
  summary.withRrmDecisionShadow++;

  if (!isRecord(dsRaw)) {
    summary.quality.parseErrorCount++;
    return;
  }

  const guardrails = isRecord(dsRaw.guardrails) ? dsRaw.guardrails : null;
  const blockReasons = Array.isArray(guardrails?.blockReasons)
    ? guardrails.blockReasons.filter((x) => typeof x === "string")
    : [];
  const isBlocked = toBool(guardrails?.blocked);

  const shadow = isRecord(dsRaw.shadow) ? dsRaw.shadow : null;
  const decision =
    shadow && typeof shadow.decision === "string" ? shadow.decision.trim() : "";

  if (decision === "same_as_baseline") {
    summary.decisionShadow.same_as_baseline++;
  } else if (decision === "switch_to_top2_candidate") {
    summary.decisionShadow.switch_to_top2_candidate++;
  } else if (decision === "no_shadow_decision") {
    summary.decisionShadow.no_shadow_decision++;
  } else if (isBlocked) {
    summary.decisionShadow.blocked++;
  } else if (blockReasons.includes("unexpected_exception")) {
    summary.decisionShadow.unexpected_exception++;
  } else {
    summary.quality.parseErrorCount++;
  }

  if (isRecord(dsRaw.inputPresence)) {
    if (toBool(dsRaw.inputPresence.scoreShadowV2)) summary.inputPresence.scoreShadowV2True++;
    if (toBool(dsRaw.inputPresence.rrmV2Top2Selector)) summary.inputPresence.rrmV2Top2SelectorTrue++;
    if (toBool(dsRaw.inputPresence.selectedTop2)) summary.inputPresence.selectedTop2True++;
    if (toBool(dsRaw.inputPresence.scoreShadowV1LegacyPresent)) {
      summary.inputPresence.scoreShadowV1LegacyPresentTrue++;
    }
  }
}

function observeBoundedDecision(summary, insights) {
  const bdRaw = insights.rrmBoundedDecision;
  if (bdRaw == null) return;
  summary.withRrmBoundedDecision++;
  if (!isRecord(bdRaw)) {
    summary.quality.parseErrorCount++;
    return;
  }
  const decision = typeof bdRaw.decision === "string" ? bdRaw.decision.trim() : "";
  if (BOUNDED_DECISION_KEYS.includes(decision)) {
    summary.boundedDecision[decision]++;
  } else {
    summary.quality.parseErrorCount++;
  }
  const fallbackReason =
    typeof bdRaw.fallbackReason === "string" && bdRaw.fallbackReason.trim().length > 0
      ? bdRaw.fallbackReason.trim()
      : null;
  if (fallbackReason) bump(summary.boundedDecision.fallbackReasonDistribution, fallbackReason);

  if (isRecord(bdRaw.inputPresence)) {
    if (toBool(bdRaw.inputPresence.scoreShadowV2)) summary.inputPresence.scoreShadowV2True++;
    if (toBool(bdRaw.inputPresence.rrmV2Top2Selector)) summary.inputPresence.rrmV2Top2SelectorTrue++;
    if (toBool(bdRaw.inputPresence.selectedTop2)) summary.inputPresence.selectedTop2True++;
    if (toBool(bdRaw.inputPresence.scoreShadowV1LegacyPresent)) {
      summary.inputPresence.scoreShadowV1LegacyPresentTrue++;
    }
  }
}

function aggregate(rows) {
  const summary = createSummarySkeleton(rows.length);
  for (const row of rows) {
    try {
      const insights = row.matchInsights;
      if (!isRecord(insights)) {
        summary.quality.malformedCount++;
        continue;
      }

      if (insights.scoreShadowV2 != null) summary.withScoreShadowV2++;
      if (insights.scoreShadow != null) summary.withScoreShadowV1Legacy++;
      if (insights.rrmV2Top2Selector != null) summary.withRrmV2Top2Selector++;

      observeDecisionShadow(summary, insights);
      observeBoundedDecision(summary, insights);
    } catch {
      summary.quality.unexpectedExceptionCount++;
    }
  }
  return summary;
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

  const take = limit > 0 ? limit : 50;
  const where = {};
  if (sinceDate) where.createdAt = { gte: sinceDate };

  const prisma = new PrismaClient();
  let rows = [];
  try {
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

  const summary = aggregate(rows);
  const out = JSON.stringify(summary, null, pretty || !jsonOneLine ? 2 : undefined);
  process.stdout.write(out + "\n");
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, reason: "fatal", message: String(e?.message ?? e) }));
  process.exit(1);
});
