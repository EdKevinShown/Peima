/**
 * M6.1-r6b — local DB helper: ensure one `batch_match_queue` row in `waiting`, then optionally print
 * anonymous `matchInsights` shape for the latest `match_results` row (no user IDs in output).
 *
 * Run from monorepo root:
 *   node --env-file=.env packages/database/scripts/m6-r6b-shadow-smoke.mjs prep
 *   node --env-file=.env packages/database/scripts/m6-r6b-shadow-smoke.mjs summarize
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

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

async function findEligibleViewerPool(prisma) {
  const pools = await prisma.previewPool.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { rankInPool: "asc" } } },
    take: 30,
  });
  for (const pool of pools) {
    if (pool.items.length < 2) continue;
    const viewerProf = await prisma.userProfile.findUnique({
      where: { userId: pool.userId },
    });
    if (!viewerProf) continue;
    const candIds = [...new Set(pool.items.map((i) => i.candidateUserId))];
    const profs = await prisma.userProfile.findMany({
      where: { userId: { in: candIds } },
      select: { userId: true },
    });
    if (profs.length < 2) continue;
    return pool;
  }
  return null;
}

async function cmdPrep() {
  tryLoadMonorepoDotEnv();
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, reason: "DATABASE_URL_missing" }));
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const pool = await findEligibleViewerPool(prisma);
    if (!pool) {
      console.log(JSON.stringify({ ok: false, reason: "no_eligible_active_preview_pool" }));
      process.exit(2);
    }
    const userId = pool.userId;
    const existing = await prisma.batchMatchQueue.findFirst({
      where: { userId, status: "waiting" },
    });
    if (!existing) {
      await prisma.batchMatchQueue.create({
        data: { userId, status: "waiting" },
      });
    }
    console.log(
      JSON.stringify({
        ok: true,
        action: existing ? "queue_already_waiting" : "queue_created",
        poolItemCount: pool.items.length,
        viewerUserIdPrefix: userId.slice(0, 4),
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

function summarizeMatchInsights(mi) {
  if (!mi || typeof mi !== "object") {
    return { matchInsights: "missing_or_null" };
  }
  const v2 = mi.scoreShadowV2;
  const v1 = mi.scoreShadow;
  const sel = mi.rrmV2Top2Selector;
  const sh = mi.rrmDecisionShadow;
  return {
    scoreShadowV2Present: Boolean(v2),
    scoreShadowV1Present: Boolean(v1),
    rrmV2Top2SelectorPresent: Boolean(sel),
    rrmDecisionShadowPresent: Boolean(sh),
    rrmDecisionShadow: sh
      ? {
          schemaVersion: sh.schemaVersion,
          sourceType: sh.sourceType,
          sourceVersion: sh.sourceVersion,
          decision: sh.shadow?.decision,
          sameAsBaseline: sh.comparison?.sameAsBaseline,
          switchSuggested: sh.comparison?.switchSuggested,
          blocked: sh.guardrails?.blocked,
          blockReasons: Array.isArray(sh.guardrails?.blockReasons)
            ? sh.guardrails.blockReasons
            : [],
          inputPresence: sh.inputPresence ?? null,
        }
      : null,
  };
}

async function cmdSummarize() {
  tryLoadMonorepoDotEnv();
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ ok: false, reason: "DATABASE_URL_missing" }));
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const row = await prisma.matchResult.findFirst({
      orderBy: { createdAt: "desc" },
      select: { matchInsights: true, finalScore: true, createdAt: true },
    });
    if (!row) {
      console.log(JSON.stringify({ ok: false, reason: "no_match_result_rows" }));
      process.exit(3);
    }
    const out = {
      ok: true,
      latestMatchResultCreatedAt: row.createdAt?.toISOString?.() ?? null,
      finalScorePresent: typeof row.finalScore === "number",
      ...summarizeMatchInsights(row.matchInsights),
    };
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const cmd = process.argv[2] ?? "help";
if (cmd === "prep") {
  await cmdPrep();
} else if (cmd === "summarize") {
  await cmdSummarize();
} else {
  console.log("usage: node ... m6-r6b-shadow-smoke.mjs prep|summarize");
  process.exit(0);
}
