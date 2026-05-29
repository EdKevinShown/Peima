/**
 * M6.8-C3 local-only helper for controlled read-layer activation smoke.
 *
 * Commands:
 *   node --env-file=.env packages/database/scripts/m6-r8-c3-controlled-activation-fixture.mjs inspect
 *   node --env-file=.env packages/database/scripts/m6-r8-c3-controlled-activation-fixture.mjs apply
 *
 * Safety:
 * - `inspect` is read-only.
 * - `apply` updates at most ONE MatchResult.matchInsights JSON row.
 * - No ID/userId/candidateUserId/conversationId in stdout.
 * - Dev/local-only; never production path.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");
const EXPECTED_SOURCE_VERSION = "m6.3-rrm-bounded-decision-v1";

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

function summarizeBoundedDecision(b) {
  if (!isRecord(b)) return { present: false };
  return {
    present: true,
    schemaVersion: b.schemaVersion ?? null,
    sourceType: b.sourceType ?? null,
    sourceVersion: b.sourceVersion ?? null,
    mode: b.mode ?? null,
    decision: b.decision ?? null,
    decisionSource: b.decisionSource ?? null,
    wouldSwitch: b.wouldSwitch === true,
    fallbackUsed: b.fallbackUsed === true,
    fallbackReason: typeof b.fallbackReason === "string" ? b.fallbackReason : null,
    guardrailsBlocked: Boolean(b.guardrails?.blocked),
    inputPresence: isRecord(b.inputPresence)
      ? {
          scoreShadowV2: b.inputPresence.scoreShadowV2 === true,
          rrmDecisionShadow: b.inputPresence.rrmDecisionShadow === true,
          rrmV2Top2Selector: b.inputPresence.rrmV2Top2Selector === true,
          selectedTop2: b.inputPresence.selectedTop2 === true,
          scoreShadowV1LegacyPresent: b.inputPresence.scoreShadowV1LegacyPresent === true,
        }
      : null,
  };
}

function buildFixturePayload({ baselineCandidateUserId, boundedTargetUserId }) {
  return {
    schemaVersion: 1,
    sourceType: "rrm_bounded_decision",
    sourceVersion: EXPECTED_SOURCE_VERSION,
    mode: "dry_run",
    decision: "would_switch_to_rrm",
    baselineRef: { kind: "user", id: baselineCandidateUserId },
    boundedRef: { kind: "user", id: boundedTargetUserId },
    decisionSource: "rrm_shadow_bounded",
    wouldSwitch: true,
    fallbackUsed: false,
    fallbackReason: null,
    guardrails: {
      blocked: false,
      blockReasons: [],
    },
    inputPresence: {
      scoreShadowV2: true,
      rrmDecisionShadow: true,
      rrmV2Top2Selector: true,
      selectedTop2: true,
      scoreShadowV1LegacyPresent: false,
    },
    generatedAt: new Date().toISOString(),
  };
}

async function findFixtureCandidate(prisma) {
  const rows = await prisma.matchResult.findMany({
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      candidateUserId: true,
      createdAt: true,
      matchInsights: true,
    },
  });

  let scanned = 0;
  for (const row of rows) {
    scanned++;
    const insights = row.matchInsights;
    if (!isRecord(insights)) continue;
    if (!isRecord(insights.scoreShadowV2)) continue;
    if (!isRecord(insights.rrmDecisionShadow)) continue;
    if (!isRecord(insights.rrmV2Top2Selector)) continue;
    const top2 = Array.isArray(insights.rrmV2Top2Selector.selectedTop2)
      ? insights.rrmV2Top2Selector.selectedTop2
      : [];
    if (!top2.length) continue;

    const baseline = String(row.candidateUserId || "").trim();
    if (!baseline) continue;

    const top2Ids = top2
      .map((x) => (isRecord(x) && typeof x.candidateUserId === "string" ? x.candidateUserId.trim() : ""))
      .filter((x) => x.length > 0);
    if (top2Ids.length < 2) continue;
    const boundedTarget = top2Ids.find((id) => id !== baseline) ?? "";
    if (!boundedTarget) continue;

    const userOk = await prisma.user.findUnique({
      where: { id: boundedTarget },
      select: { id: true },
    });
    if (!userOk) continue;

    const profileOk = await prisma.userProfile.findUnique({
      where: { userId: boundedTarget },
      select: { userId: true },
    });
    if (!profileOk) continue;

    return {
      row,
      scanned,
      boundedTargetUserId: boundedTarget,
      selectedTop2Count: top2Ids.length,
    };
  }

  return { row: null, scanned };
}

async function cmdInspect() {
  const prisma = new PrismaClient();
  try {
    const found = await findFixtureCandidate(prisma);
    if (!found.row) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            action: "inspect",
            reason: "no_eligible_match_result_for_controlled_fixture",
            scannedRows: found.scanned,
            note: "local_dev_only_no_db_write",
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "inspect",
          scannedRows: found.scanned,
          selectedTop2Count: found.selectedTop2Count,
          boundedTargetAvailable: true,
          boundedDecisionBefore: summarizeBoundedDecision(found.row.matchInsights?.rrmBoundedDecision),
          note: "local_dev_only_no_db_write",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function cmdApply() {
  const prisma = new PrismaClient();
  try {
    const found = await findFixtureCandidate(prisma);
    if (!found.row) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            action: "apply",
            reason: "no_eligible_match_result_for_controlled_fixture",
            scannedRows: found.scanned,
            dbWrite: false,
            note: "local_dev_only_no_change_applied",
          },
          null,
          2,
        ),
      );
      return;
    }

    const row = found.row;
    const before = summarizeBoundedDecision(row.matchInsights?.rrmBoundedDecision);
    const nextInsights = isRecord(row.matchInsights) ? { ...row.matchInsights } : {};
    nextInsights.rrmBoundedDecision = buildFixturePayload({
      baselineCandidateUserId: row.candidateUserId.trim(),
      boundedTargetUserId: found.boundedTargetUserId,
    });

    await prisma.matchResult.update({
      where: { id: row.id },
      data: { matchInsights: nextInsights },
      select: { id: true },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "apply",
          scannedRows: found.scanned,
          modifiedRows: 1,
          dbWrite: true,
          changedFields: ["matchInsights.rrmBoundedDecision"],
          boundedDecisionBefore: before,
          boundedDecisionAfter: summarizeBoundedDecision(nextInsights.rrmBoundedDecision),
          note: "local_dev_only_single_row_update_anonymous_output",
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        action: "apply",
        reason: "unexpected_exception",
        message: String(e?.message ?? e),
      }),
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  tryLoadMonorepoDotEnv();
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, reason: "DATABASE_URL_missing" }));
    process.exit(1);
  }
  const cmd = (process.argv[2] ?? "").trim().toLowerCase();
  if (cmd === "inspect") {
    await cmdInspect();
    return;
  }
  if (cmd === "apply") {
    await cmdApply();
    return;
  }
  console.log(
    "usage: node --env-file=.env packages/database/scripts/m6-r8-c3-controlled-activation-fixture.mjs inspect|apply",
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, reason: "fatal", message: String(e?.message ?? e) }));
  process.exit(1);
});
