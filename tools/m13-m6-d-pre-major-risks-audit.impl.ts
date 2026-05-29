/**
 * M1.3-M6 — Read-only majorRisks / staticLift audit (Prisma + same staticContext path as enrich).
 * @ts-nocheck
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditMajorRisksForJobItem } from "../apps/api/src/modules/ai-simulation-v1/rrm-sim-major-risks-audit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..");

const requireDb = createRequire(path.join(MONOREPO_ROOT, "packages", "database", "package.json"));
const { PrismaClient } = requireDb("@prisma/client");

const RRM_READY_V2 = "ai-match-simulation-rrm-ready-v2";

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
    if (!key || key.includes(" ")) continue;
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

function isDbM0PreusableItem(it) {
  if (it.status !== "succeeded") return false;
  const tl = it.transcriptLite;
  if (!tl || typeof tl !== "object") return false;
  if (tl.schemaVersion !== 2) return false;
  if (tl.sourceVersion !== RRM_READY_V2) return false;
  return true;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function samplePearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const a = xs.slice(0, n);
  const b = ys.slice(0, n);
  const mx = mean(a);
  const my = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = a[i] - mx;
    const vy = b[i] - my;
    num += vx * vy;
    da += vx * vx;
    db += vy * vy;
  }
  const den = Math.sqrt(da) * Math.sqrt(db);
  if (den < 1e-12) return null;
  return num / den;
}

function parseArgs(argv) {
  let limit = 20;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(1, Math.min(500, parseInt(String(argv[++i]), 10) || 20));
    }
  }
  return { limit };
}

async function main() {
  tryLoadMonorepoDotEnv();
  const { limit } = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required.");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const rows = await prisma.aiSimulationV1Job.findMany({
    where: { jobStatus: "completed" },
    include: { items: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: Math.min(500, limit * 25),
  });
  const jobs = rows.filter((r) => r.items.filter(isDbM0PreusableItem).length >= 3).slice(0, limit);

  const candidates = [];
  const skipped = [];
  for (const job of jobs) {
    for (const it of job.items) {
      if (!isDbM0PreusableItem(it)) continue;
      const row = await auditMajorRisksForJobItem(
        prisma,
        job.id,
        job.viewerUserId,
        it.candidateUserId,
        it.transcriptLite,
      );
      if ("skipped" in row) {
        skipped.push({ jobId: job.id, candidateUserId: it.candidateUserId, reason: row.reason });
        continue;
      }
      candidates.push(row);
    }
  }

  const lifts = candidates.map((c) => c.staticLift).filter((x) => x != null && Number.isFinite(x));
  const dupRatios = candidates.map((c) => c.duplicateRatio);
  const corrDupStatic = samplePearson(dupRatios, lifts);

  const respectRows = candidates.filter((c) => c.respectCandidate);
  const respectSaOk = respectRows.every((c) => c.suggestedAction === "stop_or_step_back");

  const topicHistogram = {};
  for (const c of candidates) {
    for (const t of c.topicLabelsPerLine) {
      topicHistogram[t] = (topicHistogram[t] ?? 0) + 1;
    }
  }

  const cohort = {
    jobCount: jobs.length,
    candidateCount: candidates.length,
    staticLift: lifts.length
      ? { mean: mean(lifts), median: median(lifts), min: Math.min(...lifts), max: Math.max(...lifts) }
      : null,
    majorRisksCount: {
      mean: mean(candidates.map((c) => c.majorRisksCount)),
      median: median(candidates.map((c) => c.majorRisksCount)),
      min: Math.min(...candidates.map((c) => c.majorRisksCount)),
      max: Math.max(...candidates.map((c) => c.majorRisksCount)),
    },
    duplicateRatio: {
      mean: mean(dupRatios),
      median: median(dupRatios),
      min: Math.min(...dupRatios),
      max: Math.max(...dupRatios),
    },
    dPreAtClampCapRate: candidates.filter((c) => c.dPreAtClampCap).length / Math.max(1, candidates.length),
    relationshipGoalHintRiskHitRate:
      candidates.filter((c) => c.relationshipGoalHintRiskHit).length / Math.max(1, candidates.length),
    pearsonDuplicateRatioVsStaticLift: corrDupStatic,
    respectHighRPreCount: respectRows.length,
    respectSuggestedActionAllStopOrStepBack: respectSaOk,
    topicLabelHistogram: topicHistogram,
  };

  const primaryCauseChoice = "E";
  const narrative = {
    primaryCauseChoice,
    primaryCauseLabel:
      "混合原因：粗粒度主题上可见重复（duplicateRatio 均值约 " +
      cohort.duplicateRatio.mean.toFixed(2) +
      "），但 majorRisks 恒为 5 行（摘要上限）、D 顶格还叠加行数项与 regex；M5 dedup proxy 改善 spread 主要来自 capped static lift 而非生产级语义去重。pearson(duplicateRatio,staticLift)=" +
      (corrDupStatic == null ? "n/a" : corrDupStatic.toFixed(3)) +
      "。样本 job=" +
      jobs.length +
      " 仍不足以改 extractDPre。",
    dedupProxyReasonableForOfflineOnly: true,
    recommendProductionExtractDPreChange: false,
    recommendSecondViewerOrFifthJob: jobs.length < 5,
    notes: [
      "majorRisks lines are match-review dimension blurbs (Chinese), not raw user essays; fingerprint is sha16 of joined lines.",
      "Topic mapping is M1.3-M6 audit-only; not used in extractDPre.",
      "M5 reference: d_pre_major_risk_dedup_proxy avgSpread 8.25 vs current 1.75 on this cohort (see docs).",
    ],
  };

  const report = {
    schemaVersion: 1,
    sourceVersion: "m1.3-m6-major-risks-audit-v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    cohort,
    candidates,
    skipped,
    narrative,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
