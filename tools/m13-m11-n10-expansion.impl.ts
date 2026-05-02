/**
 * M1.3-M11 — Expand shadow cohort usableJobCount toward >=10:
 * (1) reset-failed + in-process run on repairable completed jobs;
 * (2) if none, create queued jobs from real preview pools (hintSnapshot + shortlistBinding
 *     aligned with AiSimulationV1Service.enqueue) then single-consumer run.
 * Re-reads root `.env`. Does not modify extractDPre / production evaluator / MatchResult.
 * @ts-nocheck
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runAiSimulationV1JobExecution } from "../packages/ai-simulation-v1-runner/src/run-ai-simulation-v1-job-execution";
import { completeAiSimulationChatFromEnv } from "../packages/ai-simulation-v1-runner/src/ai-simulation-env-chat";
import { loadQuestionnaireProfileViewForAiJob } from "../packages/ai-simulation-v1-runner/src/questionnaire-profile-loader";
import { ITEM_STATUS, JOB_STATUS } from "../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import {
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  AI_SIMULATION_RUN_SPEC_V1,
} from "../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { resolveSimulationQueueFromHintSnapshot } from "../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-hint";
import { computeShortlistFingerprint } from "../apps/api/src/modules/ai-simulation-v1/shortlist-contract-binding";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../apps/api/src/modules/preview-pool/preview-pool-shortlist-contract.v0";
import { evaluateRrmSimFromSimulationV2 } from "../apps/api/src/modules/ai-simulation-v1/rrm-sim.evaluator";
import { buildMatchReviewStaticSummary } from "../apps/api/src/modules/match-review-ai/match-review-static-summary";
import { buildAiSimulationStaticContext } from "../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-static-context";
import { loadQuestionnaireProfileViewForAudit } from "../apps/api/src/modules/questionnaire/questionnaire-profile-view.util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..");
const RRM_READY_V2 = "ai-match-simulation-rrm-ready-v2";
const TARGET_USABLE = 10;
const MIN_TIMEOUT_MS = 180000;
/** Pools with no prior ai_simulation job (verified); top-3 shortlist from rankInPool. */
const DEFAULT_SEED_POOL_IDS = ["cmodu6u5x00016zt8s55u3psa", "cmodsselu00016zwskeek6p5p"];

const requireDb = createRequire(path.join(MONOREPO_ROOT, "packages", "database", "package.json"));
const { PrismaClient, Prisma } = requireDb("@prisma/client");

function forceLoadRootEnv() {
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
    process.env[key] = val;
  }
}

function logJson(obj: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

function dockerPeimaWorkerRunning(): boolean {
  const r = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8", shell: true });
  if (r.status !== 0 || !r.stdout) return false;
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .some((n) => n.includes("peima-worker"));
}

function isRrmReadyItem(it: { status: string; transcriptLite?: unknown }) {
  if (it.status !== ITEM_STATUS.SUCCEEDED) return false;
  const tl = it.transcriptLite;
  if (!tl || typeof tl !== "object" || Array.isArray(tl)) return false;
  return (tl as { schemaVersion?: unknown }).schemaVersion === 2 && (tl as { sourceVersion?: unknown }).sourceVersion === RRM_READY_V2;
}

function rrmReadyCount(job: { items: Array<{ status: string; transcriptLite?: unknown }> }) {
  return job.items.filter(isRrmReadyItem).length;
}

function isUsableJob(job: { jobStatus: string; items: unknown[] }) {
  return job.jobStatus === JOB_STATUS.COMPLETED && job.items.length >= 3 && rrmReadyCount(job as never) >= 3;
}

async function countUsableCompleted(prisma: any) {
  const rows = await prisma.aiSimulationV1Job.findMany({
    where: { jobStatus: JOB_STATUS.COMPLETED },
    include: { items: true },
  });
  return rows.filter(isUsableJob).length;
}

function parseJobIdsFromArgv(): string[] | null {
  const raw = process.argv.find((a) => a.startsWith("--jobIds="));
  if (raw) {
    return raw
      .slice("--jobIds=".length)
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

function parsePoolIdsFromArgv(): string[] | null {
  const raw = process.argv.find((a) => a.startsWith("--poolIds="));
  if (raw) {
    return raw
      .slice("--poolIds=".length)
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

async function listRepairable(prisma: any) {
  const rows = await prisma.aiSimulationV1Job.findMany({
    where: { jobStatus: JOB_STATUS.COMPLETED },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
  });
  const usableViewers = new Set<string>();
  for (const j of rows) {
    if (j.items.length < 3) continue;
    if (rrmReadyCount(j) >= 3) usableViewers.add(j.viewerUserId);
  }
  const out: { id: string; viewerUserId: string; poolId: string; failed: number; rrm: number }[] = [];
  for (const j of rows) {
    if (j.items.length < 3) continue;
    const failed = j.items.filter((it: { status: string }) => it.status === ITEM_STATUS.FAILED).length;
    const rrm = rrmReadyCount(j);
    if (failed === 0 || rrm + failed < 3 || rrm >= 3) continue;
    out.push({ id: j.id, viewerUserId: j.viewerUserId, poolId: j.poolId, failed, rrm });
  }
  out.sort((a, b) => {
    const da = usableViewers.has(a.viewerUserId) ? 1 : 0;
    const db = usableViewers.has(b.viewerUserId) ? 1 : 0;
    if (da !== db) return da - db;
    return b.failed - a.failed;
  });
  return out;
}

async function assertGlobalQueueClear(prisma: any) {
  const n = await prisma.aiSimulationV1Job.count({
    where: { jobStatus: { in: [JOB_STATUS.QUEUED, JOB_STATUS.RUNNING] } },
  });
  if (n !== 0) {
    logJson({ event: "m13_m11_abort", reason: "global_queued_or_running_nonzero", count: n });
    process.exit(1);
  }
}

async function resetFailedAndRunOneJob(prisma: any, jobId: string) {
  const jobBefore = await prisma.aiSimulationV1Job.findFirst({
    where: { id: jobId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!jobBefore) {
    logJson({ event: "m13_m11_skip", reason: "job_not_found", jobId });
    return { ok: false as const };
  }
  if (jobBefore.jobStatus === JOB_STATUS.RUNNING) {
    logJson({ event: "m13_m11_abort", reason: "target_stuck_running", jobId });
    process.exit(1);
  }
  const failedN = jobBefore.items.filter((it: { status: string }) => it.status === ITEM_STATUS.FAILED).length;
  if (failedN === 0) {
    logJson({ event: "m13_m11_skip", reason: "no_failed_items", jobId });
    return { ok: false as const };
  }
  if (rrmReadyCount(jobBefore as never) + failedN < 3) {
    logJson({ event: "m13_m11_skip", reason: "cannot_reach_three_rrm_with_failed_only", jobId });
    return { ok: false as const };
  }

  await assertGlobalQueueClear(prisma);

  const resetCount = await prisma.$transaction(async (tx: any) => {
    const u = await tx.aiSimulationV1Item.updateMany({
      where: { jobId, status: ITEM_STATUS.FAILED },
      data: {
        status: ITEM_STATUS.QUEUED,
        attemptCount: 0,
        errorCode: null,
        failureDetail: Prisma.DbNull,
        transcriptLite: Prisma.DbNull,
        evaluator: Prisma.DbNull,
      },
    });
    await tx.aiSimulationV1Job.update({
      where: { id: jobId },
      data: { jobStatus: JOB_STATUS.QUEUED },
    });
    return u.count;
  });

  const q = await prisma.aiSimulationV1Job.findMany({ where: { jobStatus: JOB_STATUS.QUEUED }, select: { id: true } });
  if (q.length !== 1 || q[0].id !== jobId) {
    logJson({ event: "m13_m11_abort", reason: "unexpected_queued_set", expected: jobId, got: q.map((x: { id: string }) => x.id) });
    process.exit(1);
  }

  const claimed = await prisma.aiSimulationV1Job.updateMany({
    where: { id: jobId, jobStatus: JOB_STATUS.QUEUED },
    data: { jobStatus: JOB_STATUS.RUNNING },
  });
  if (claimed.count !== 1) {
    logJson({ event: "m13_m11_abort", reason: "claim_failed", jobId });
    process.exit(1);
  }

  const ports = {
    prisma,
    logError: (meta: Record<string, unknown>, message: string) => {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "m13_m11_log_error", message, ...meta }));
    },
    completeChat: (system: string, user: string) => completeAiSimulationChatFromEnv(system, user),
    getProfileForUser: (userId: string) => loadQuestionnaireProfileViewForAiJob(prisma, userId),
  };

  logJson({ event: "m13_m11_execution_start", jobId, viewerUserId: jobBefore.viewerUserId, mode: "reset_failed", failedItemsReset: resetCount });
  await runAiSimulationV1JobExecution(ports, { jobId, viewerUserId: jobBefore.viewerUserId });
  logJson({ event: "m13_m11_execution_end", jobId });

  return summarizeJobAfterRun(prisma, jobId);
}

async function createQueuedJobFromPool(prisma: any, poolId: string): Promise<string> {
  const pool = await prisma.previewPool.findFirst({
    where: { id: poolId },
    include: { items: { orderBy: { rankInPool: "asc" } } },
  });
  if (!pool || pool.items.length < 3) {
    logJson({ event: "m13_m11_abort", reason: "pool_not_found_or_lt3_items", poolId });
    process.exit(1);
  }
  const top = pool.items.slice(0, 3);
  const hintSnapshot = top.map((it: { rankInPool: number; candidateUserId: string }) => ({
    bucket: "neutral" as const,
    rankHint: it.rankInPool,
    prescreenScore: 0.425,
    candidateUserId: it.candidateUserId,
  }));
  const { entries, simulationQueueActual } = resolveSimulationQueueFromHintSnapshot(hintSnapshot);
  if (entries.length !== 3 || simulationQueueActual.length !== 3) {
    logJson({ event: "m13_m11_abort", reason: "hint_resolve_not_three", poolId });
    process.exit(1);
  }
  const fp = computeShortlistFingerprint(simulationQueueActual);
  const shortlistBinding = {
    previewPoolId: poolId,
    shortlistSchemaVersion: PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION,
    shortlistFingerprint: fp,
    shortlistCandidateUserIds: simulationQueueActual,
  };

  await assertGlobalQueueClear(prisma);

  const job = await prisma.$transaction(async (tx: any) => {
    const j = await tx.aiSimulationV1Job.create({
      data: {
        viewerUserId: pool.userId,
        poolId,
        schemaVersion: AI_SIMULATION_V1_SCHEMA,
        runSpecVersion: AI_SIMULATION_RUN_SPEC_V1,
        hintSource: AI_SIMULATION_V1_HINT_SOURCE,
        hintSnapshot,
        shortlistBinding,
        simulationQueueActual,
        jobStatus: JOB_STATUS.QUEUED,
      },
    });
    await tx.aiSimulationV1Item.createMany({
      data: entries.map((e: { candidateUserId: string }) => ({
        jobId: j.id,
        candidateUserId: e.candidateUserId,
        status: ITEM_STATUS.QUEUED,
        attemptCount: 0,
      })),
    });
    return j;
  });

  logJson({ event: "m13_m11_seeded_queued_job", jobId: job.id, poolId, viewerUserId: pool.userId, simulationQueueActual });
  return job.id as string;
}

async function claimAndRunJob(prisma: any, jobId: string, viewerUserId: string) {
  const q = await prisma.aiSimulationV1Job.findMany({ where: { jobStatus: JOB_STATUS.QUEUED }, select: { id: true } });
  if (q.length !== 1 || q[0].id !== jobId) {
    logJson({ event: "m13_m11_abort", reason: "unexpected_queued_set_after_seed", expected: jobId, got: q.map((x: { id: string }) => x.id) });
    process.exit(1);
  }
  const claimed = await prisma.aiSimulationV1Job.updateMany({
    where: { id: jobId, jobStatus: JOB_STATUS.QUEUED },
    data: { jobStatus: JOB_STATUS.RUNNING },
  });
  if (claimed.count !== 1) {
    logJson({ event: "m13_m11_abort", reason: "claim_failed", jobId });
    process.exit(1);
  }
  const ports = {
    prisma,
    logError: (meta: Record<string, unknown>, message: string) => {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "m13_m11_log_error", message, ...meta }));
    },
    completeChat: (system: string, user: string) => completeAiSimulationChatFromEnv(system, user),
    getProfileForUser: (userId: string) => loadQuestionnaireProfileViewForAiJob(prisma, userId),
  };
  logJson({ event: "m13_m11_execution_start", jobId, viewerUserId, mode: "seed_from_pool" });
  await runAiSimulationV1JobExecution(ports, { jobId, viewerUserId });
  logJson({ event: "m13_m11_execution_end", jobId });
  return summarizeJobAfterRun(prisma, jobId);
}

async function summarizeJobAfterRun(prisma: any, jobId: string) {
  const jobAfter = await prisma.aiSimulationV1Job.findFirst({
    where: { id: jobId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  const rr = rrmReadyCount(jobAfter as never);
  const succ = jobAfter.items.filter((it: { status: string }) => it.status === ITEM_STATUS.SUCCEEDED).length;
  const fail = jobAfter.items.filter((it: { status: string }) => it.status === ITEM_STATUS.FAILED).length;
  const rhythms: number[] = [];
  const viewerId = jobAfter.viewerUserId;
  for (const it of jobAfter.items) {
    if (!isRrmReadyItem(it)) continue;
    try {
      const vv = await loadQuestionnaireProfileViewForAudit(prisma, viewerId);
      const cv = await loadQuestionnaireProfileViewForAudit(prisma, it.candidateUserId);
      const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(vv, cv);
      const staticCtx = buildAiSimulationStaticContext({
        reviewStaticScore,
        staticSummary,
        viewer: vv,
        candidate: cv,
      });
      const out = evaluateRrmSimFromSimulationV2(it.transcriptLite, staticCtx);
      if (!out.fallbackUsed && out.scores?.simulatedRhythmScore != null) rhythms.push(out.scores.simulatedRhythmScore);
    } catch {
      /* ignore */
    }
  }
  logJson({
    event: "m13_m11_job_summary",
    jobId,
    viewerUserId: jobAfter.viewerUserId,
    poolId: jobAfter.poolId,
    jobStatus: jobAfter.jobStatus,
    itemCount: jobAfter.items.length,
    succeededCount: succ,
    failedCount: fail,
    rrmReadyV2ItemCount: rr,
    rhythmMin: rhythms.length ? Math.min(...rhythms) : null,
    rhythmMax: rhythms.length ? Math.max(...rhythms) : null,
    itemErrors: jobAfter.items.map((it: any) => ({
      candidateUserId: it.candidateUserId,
      status: it.status,
      errorCode: it.errorCode,
      failureSnippet: it.failureDetail ? JSON.stringify(it.failureDetail).slice(0, 200) : "",
    })),
  });
  if (rr < 3) {
    logJson({ event: "m13_m11_stop", reason: "job_not_usable_after_run", jobId, rrmReadyV2ItemCount: rr });
    process.exit(1);
  }
  return { ok: true as const, rrmReady: rr };
}

function runJsonTool(relPath: string, extraArgs: string[]) {
  const impl = path.join(MONOREPO_ROOT, relPath);
  const r = spawnSync("npx", ["--yes", "tsx", impl, ...extraArgs], {
    encoding: "utf8",
    cwd: MONOREPO_ROOT,
    env: process.env,
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    logJson({ event: "m13_m11_tool_failed", relPath, stderr: (r.stderr || "").slice(0, 500) });
    return null;
  }
  try {
    return JSON.parse(r.stdout || "{}");
  } catch {
    logJson({ event: "m13_m11_tool_parse_failed", relPath });
    return null;
  }
}

async function main() {
  forceLoadRootEnv();
  if (!process.env.DATABASE_URL) {
    logJson({ event: "m13_m11_abort", reason: "missing_DATABASE_URL" });
    process.exit(1);
  }

  const timeoutMs = parseInt(process.env.AI_SIMULATION_V1_TIMEOUT_MS ?? "0", 10);
  const key = (process.env.AI_SIMULATION_V1_API_KEY ?? process.env.MATCH_REVIEW_AI_API_KEY ?? "").trim();
  const keyOk = key.length > 0 && key.startsWith("sk-");
  logJson({
    event: "m13_m11_precheck",
    dockerPeimaWorker: dockerPeimaWorkerRunning(),
    AI_SIMULATION_V1_TIMEOUT_MS: timeoutMs,
    apiKeyPresentSkPrefix: keyOk,
  });
  if (dockerPeimaWorkerRunning()) {
    logJson({ event: "m13_m11_abort", reason: "docker_peima_worker_running" });
    process.exit(1);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS) {
    logJson({ event: "m13_m11_abort", reason: "AI_SIMULATION_V1_TIMEOUT_MS_lt_180000" });
    process.exit(1);
  }
  if (!keyOk) {
    logJson({ event: "m13_m11_abort", reason: "missing_or_non_sk_api_key" });
    process.exit(1);
  }

  const ping = await completeAiSimulationChatFromEnv("You are a ping responder. Reply with exactly: ok", "ping");
  logJson({
    event: "m13_m11_ping",
    ok: ping.ok,
    kind: ping.ok ? "ok" : ping.kind,
    httpStatus: !ping.ok && ping.kind === "http" ? ping.status : undefined,
  });
  if (!ping.ok) {
    if (ping.kind === "http" && ping.status === 401) process.exit(1);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let usable = await countUsableCompleted(prisma);
  logJson({ event: "m13_m11_start_usable", usableJobCountDb: usable });
  if (usable >= TARGET_USABLE) {
    logJson({ event: "m13_m11_skip", reason: "already_at_target", usableJobCountDb: usable });
    await prisma.$disconnect();
    return;
  }

  const explicitJobs = parseJobIdsFromArgv();
  const explicitPools = parsePoolIdsFromArgv();
  const processed = new Set<string>();
  const repairable = explicitJobs ? [] : await listRepairable(prisma);
  const seedPools = explicitPools ?? DEFAULT_SEED_POOL_IDS;
  let seedIdx = 0;

  const roundsMax = explicitJobs ? explicitJobs.length : Math.min(2, TARGET_USABLE - usable);

  for (let round = 0; round < roundsMax && usable < TARGET_USABLE; round += 1) {
    let jobId: string | null = null;
    let viewerUserId: string | null = null;
    let mode: "explicit_repair" | "repair" | "seed" = "seed";

    if (explicitJobs && explicitJobs[round]) {
      jobId = explicitJobs[round];
      mode = "explicit_repair";
    } else {
      const next = repairable.find((r) => !processed.has(r.id));
      if (next) {
        jobId = next.id;
        mode = "repair";
      } else if (seedIdx < seedPools.length) {
        const poolId = seedPools[seedIdx];
        seedIdx += 1;
        const pool = await prisma.previewPool.findFirst({ where: { id: poolId }, select: { userId: true } });
        if (!pool) {
          logJson({ event: "m13_m11_abort", reason: "seed_pool_missing", poolId });
          process.exit(1);
        }
        viewerUserId = pool.userId;
        jobId = await createQueuedJobFromPool(prisma, poolId);
        mode = "seed";
      }
    }

    if (!jobId) {
      logJson({ event: "m13_m11_stop", reason: "no_more_candidates", usableJobCountDb: usable });
      break;
    }
    if (processed.has(jobId)) continue;
    processed.add(jobId);

    logJson({ event: "m13_m11_round", round: round + 1, jobId, mode });

    if (mode === "seed" && viewerUserId) {
      await claimAndRunJob(prisma, jobId, viewerUserId);
    } else {
      await resetFailedAndRunOneJob(prisma, jobId);
    }

    usable = await countUsableCompleted(prisma);
    logJson({ event: "m13_m11_after_round_usable", usableJobCountDb: usable });

    const sim = runJsonTool("tools/m13-m0-calibration-simulator.impl.ts", ["--limit", "40", "--pretty", "--includeDebug"]);
    if (sim?.summary)
      logJson({
        event: "m13_m11_simulator_summary",
        usableJobCount: sim.summary.usableJobCount,
        current: sim.summary.perConfig?.current,
        dedup: sim.summary.perConfig?.d_pre_major_risk_dedup_proxy,
        staticCap: sim.summary.perConfig?.d_pre_static_cap_proxy,
        softCap: sim.summary.perConfig?.d_pre_soft_cap_proxy,
      });

    const audit = runJsonTool("tools/m13-m6-d-pre-major-risks-audit.impl.ts", ["--limit", "40"]);
    if (audit?.cohort)
      logJson({
        event: "m13_m11_m6_audit",
        jobCount: audit.cohort.jobCount,
        candidateCount: audit.cohort.candidateCount,
        staticLift: audit.cohort.staticLift,
        duplicateRatio: audit.cohort.duplicateRatio,
        pearsonDupStatic: audit.cohort.pearsonDuplicateRatioVsStaticLift,
        respectAllStop: audit.cohort.respectSuggestedActionAllStopOrStepBack,
        dPreAtClampCapRate: audit.cohort.dPreAtClampCapRate,
      });
  }

  usable = await countUsableCompleted(prisma);
  logJson({ event: "m13_m11_final_usable", usableJobCountDb: usable, targetMet: usable >= TARGET_USABLE });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(JSON.stringify({ event: "m13_m11_fatal", err: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
