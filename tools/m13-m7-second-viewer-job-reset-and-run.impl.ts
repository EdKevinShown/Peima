/**
 * M1.3-M7 — Reset failed items on one ai-simulation-v1 job + single in-process execution (no Docker worker).
 *
 * Re-reads monorepo root `.env` at start (overwrites matching keys on `process.env`).
 * If LLM returns `invalid_json` / aborted under default timeout, raise `AI_SIMULATION_V1_TIMEOUT_MS` in `.env`
 * and re-run this script (failed-only reset is idempotent for succeeded rows).
 *
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
import {
  ITEM_STATUS,
  JOB_STATUS,
} from "../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { evaluateRrmSimFromSimulationV2 } from "../apps/api/src/modules/ai-simulation-v1/rrm-sim.evaluator";
import { buildMatchReviewStaticSummary } from "../apps/api/src/modules/match-review-ai/match-review-static-summary";
import { buildAiSimulationStaticContext } from "../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-static-context";
import { loadQuestionnaireProfileViewForAudit } from "../apps/api/src/modules/questionnaire/questionnaire-profile-view.util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..");

const TARGET_JOB_ID = "cmonhuv0k00066z444g63dwph";

const requireDb = createRequire(path.join(MONOREPO_ROOT, "packages", "database", "package.json"));
const { PrismaClient, Prisma } = requireDb("@prisma/client");

/** Overwrite `process.env` from monorepo root `.env` (same keys as file; does not print values). */
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
  const r = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0 || !r.stdout) return false;
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .some((n) => n.includes("peima-worker"));
}

function summarizeFailureDetail(fd: unknown): string {
  if (fd == null) return "";
  try {
    const s = JSON.stringify(fd);
    return s.length > 240 ? `${s.slice(0, 240)}…` : s;
  } catch {
    return "[unserializable]";
  }
}

async function main() {
  forceLoadRootEnv();

  if (!process.env.DATABASE_URL) {
    logJson({ event: "m13_m7_abort", reason: "missing_DATABASE_URL" });
    process.exit(1);
  }

  logJson({ event: "m13_m7_docker_check", peimaWorkerContainerSeen: dockerPeimaWorkerRunning() });
  if (dockerPeimaWorkerRunning()) {
    logJson({ event: "m13_m7_abort", reason: "docker_peima_worker_running" });
    process.exit(1);
  }

  const prisma = new PrismaClient();

  const runningOther = await prisma.aiSimulationV1Job.count({
    where: { jobStatus: JOB_STATUS.RUNNING, id: { not: TARGET_JOB_ID } },
  });
  const queuedOther = await prisma.aiSimulationV1Job.count({
    where: { jobStatus: JOB_STATUS.QUEUED, id: { not: TARGET_JOB_ID } },
  });
  logJson({ event: "m13_m7_queue_precheck", runningOtherJobs: runningOther, queuedOtherJobs: queuedOther });
  if (runningOther > 0 || queuedOther > 0) {
    logJson({ event: "m13_m7_abort", reason: "other_jobs_queued_or_running" });
    await prisma.$disconnect();
    process.exit(1);
  }

  const ping = await completeAiSimulationChatFromEnv(
    "You are a ping responder. Reply with exactly: ok",
    "ping",
  );
  logJson({
    event: "m13_m7_completeAiSimulationChatFromEnv_ping",
    ok: ping.ok,
    kind: ping.ok ? "ok" : ping.kind,
    httpStatus: !ping.ok && ping.kind === "http" ? ping.status : undefined,
  });
  if (!ping.ok) {
    if (ping.kind === "http" && ping.status === 401) {
      logJson({ event: "m13_m7_abort", reason: "provider_401" });
      await prisma.$disconnect();
      process.exit(1);
    }
    logJson({ event: "m13_m7_abort", reason: "chat_ping_failed" });
    await prisma.$disconnect();
    process.exit(1);
  }

  const jobBefore = await prisma.aiSimulationV1Job.findFirst({
    where: { id: TARGET_JOB_ID },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!jobBefore) {
    logJson({ event: "m13_m7_abort", reason: "job_not_found", jobId: TARGET_JOB_ID });
    await prisma.$disconnect();
    process.exit(1);
  }

  if (jobBefore.jobStatus === JOB_STATUS.RUNNING) {
    logJson({ event: "m13_m7_abort", reason: "target_job_stuck_running_use_recovery_first" });
    await prisma.$disconnect();
    process.exit(1);
  }

  const failedIds = jobBefore.items.filter((it) => it.status === ITEM_STATUS.FAILED).map((it) => it.id);
  logJson({
    event: "m13_m7_job_before",
    jobId: jobBefore.id,
    jobStatus: jobBefore.jobStatus,
    viewerUserId: jobBefore.viewerUserId,
    itemCount: jobBefore.items.length,
    failedItemCount: failedIds.length,
    succeededCount: jobBefore.items.filter((it) => it.status === ITEM_STATUS.SUCCEEDED).length,
  });

  if (failedIds.length === 0) {
    logJson({ event: "m13_m7_abort", reason: "no_failed_items_to_reset" });
    await prisma.$disconnect();
    process.exit(1);
  }

  const resetCount = await prisma.$transaction(async (tx) => {
    const u = await tx.aiSimulationV1Item.updateMany({
      where: { jobId: TARGET_JOB_ID, status: ITEM_STATUS.FAILED },
      data: {
        status: ITEM_STATUS.QUEUED,
        attemptCount: 0,
        errorCode: null,
        failureDetail: Prisma.DbNull,
        transcriptLite: null,
        evaluator: null,
      },
    });
    await tx.aiSimulationV1Job.update({
      where: { id: TARGET_JOB_ID },
      data: { jobStatus: JOB_STATUS.QUEUED },
    });
    return u.count;
  });

  logJson({ event: "m13_m7_reset_done", failedItemsResetToQueued: resetCount });

  const queuedJobs = await prisma.aiSimulationV1Job.findMany({
    where: { jobStatus: JOB_STATUS.QUEUED },
    select: { id: true },
  });
  if (queuedJobs.length !== 1 || queuedJobs[0].id !== TARGET_JOB_ID) {
    logJson({
      event: "m13_m7_abort",
      reason: "unexpected_queued_job_set_after_reset",
      queuedJobIds: queuedJobs.map((j) => j.id),
    });
    await prisma.$disconnect();
    process.exit(1);
  }

  const claimed = await prisma.aiSimulationV1Job.updateMany({
    where: { id: TARGET_JOB_ID, jobStatus: JOB_STATUS.QUEUED },
    data: { jobStatus: JOB_STATUS.RUNNING },
  });
  if (claimed.count !== 1) {
    logJson({ event: "m13_m7_abort", reason: "claim_queued_to_running_failed" });
    await prisma.$disconnect();
    process.exit(1);
  }

  const ports = {
    prisma,
    logError: (meta: Record<string, unknown>, message: string) => {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "m13_m7_log_error", message, ...meta }));
    },
    completeChat: (system: string, user: string) => completeAiSimulationChatFromEnv(system, user),
    getProfileForUser: (userId: string) => loadQuestionnaireProfileViewForAiJob(prisma, userId),
  };

  logJson({ event: "m13_m7_execution_start", jobId: TARGET_JOB_ID, viewerUserId: jobBefore.viewerUserId });
  await runAiSimulationV1JobExecution(ports, { jobId: TARGET_JOB_ID, viewerUserId: jobBefore.viewerUserId });
  logJson({ event: "m13_m7_execution_end", jobId: TARGET_JOB_ID });

  const jobAfter = await prisma.aiSimulationV1Job.findFirst({
    where: { id: TARGET_JOB_ID },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  const RRM_READY = "ai-match-simulation-rrm-ready-v2";
  let rrmReady = 0;
  const itemRows = [];
  const viewerId = jobAfter?.viewerUserId ?? "";
  for (const it of jobAfter?.items ?? []) {
    const tl = it.transcriptLite;
    const sv = tl && typeof tl === "object" && !Array.isArray(tl) ? (tl as { schemaVersion?: unknown }).schemaVersion : null;
    const src =
      tl && typeof tl === "object" && !Array.isArray(tl) ? (tl as { sourceVersion?: unknown }).sourceVersion : null;
    const scen =
      tl && typeof tl === "object" && !Array.isArray(tl)
        ? (tl as { scenarioResults?: unknown }).scenarioResults
        : null;
    const scenLen = Array.isArray(scen) ? scen.length : null;
    const okRrm =
      it.status === ITEM_STATUS.SUCCEEDED &&
      tl &&
      typeof tl === "object" &&
      sv === 2 &&
      src === RRM_READY &&
      scenLen === 7;
    if (okRrm) rrmReady += 1;
    let rhythm = null;
    let fallback = null;
    let suggestedAction = null;
    let progressionWindow = null;
    try {
      if (okRrm && tl && viewerId) {
        const vv = await loadQuestionnaireProfileViewForAudit(prisma, viewerId);
        const cv = await loadQuestionnaireProfileViewForAudit(prisma, it.candidateUserId);
        const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(vv, cv);
        const staticCtx = buildAiSimulationStaticContext({
          reviewStaticScore,
          staticSummary,
          viewer: vv,
          candidate: cv,
        });
        const rr = evaluateRrmSimFromSimulationV2(tl, staticCtx);
        fallback = rr.fallbackUsed === true;
        if (!fallback && rr.scores) {
          rhythm = rr.scores.simulatedRhythmScore ?? null;
          suggestedAction = rr.suggestedAction ?? null;
          progressionWindow = rr.progressionWindow ?? null;
        }
      }
    } catch {
      /* optional post-hoc */
    }
    itemRows.push({
      candidateUserId: it.candidateUserId,
      status: it.status,
      errorCode: it.errorCode,
      failureDetailSummary: summarizeFailureDetail(it.failureDetail),
      attemptCount: it.attemptCount,
      transcriptSchemaVersion: sv,
      transcriptSourceVersion: src,
      scenarioResultsLength: scenLen,
      rrmFallbackUsed: fallback,
      rhythmScore: rhythm,
      suggestedAction,
      progressionWindow,
    });
  }

  logJson({
    event: "m13_m7_job_after",
    jobId: jobAfter?.id,
    jobStatus: jobAfter?.jobStatus,
    itemCount: jobAfter?.items.length ?? 0,
    succeededCount: jobAfter?.items.filter((it) => it.status === ITEM_STATUS.SUCCEEDED).length ?? 0,
    failedCount: jobAfter?.items.filter((it) => it.status === ITEM_STATUS.FAILED).length ?? 0,
    rrmReadyV2ItemCount: rrmReady,
    items: itemRows,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(JSON.stringify({ event: "m13_m7_fatal", err: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
