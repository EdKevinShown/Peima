import { PrismaClient } from "@peima/database";
import { completeAiSimulationChatFromEnv } from "./ai-simulation-env-chat";
import { loadQuestionnaireProfileViewForAiJob } from "./questionnaire-profile-loader";
import { runAiSimulationV1JobExecution, type AiSimulationV1JobRunPorts } from "./run-ai-simulation-v1-job-execution";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function readPollMs(): number {
  const raw = parseInt(process.env.AI_SIMULATION_V1_WORKER_POLL_MS ?? "10000", 10);
  if (!Number.isFinite(raw) || raw < 1000) {
    return 10_000;
  }
  return Math.trunc(raw);
}

/** Default 15m — must exceed worst-case single-job LLM duration to avoid false recovery. */
function readStuckTimeoutMs(): number {
  const raw = parseInt(process.env.AI_SIMULATION_V1_STUCK_TIMEOUT_MS ?? "900000", 10);
  if (!Number.isFinite(raw) || raw < 60_000) {
    return 900_000;
  }
  return Math.trunc(raw);
}

function readRecoveryPollMs(): number {
  const raw = parseInt(process.env.AI_SIMULATION_V1_RECOVERY_POLL_MS ?? "60000", 10);
  if (!Number.isFinite(raw) || raw < 5000) {
    return 60_000;
  }
  return Math.trunc(raw);
}

function workerLog(event: string, extra: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...extra,
    }),
  );
}

function buildPorts(prisma: PrismaClient): AiSimulationV1JobRunPorts {
  return {
    prisma,
    logError: (meta, message) => {
      console.error(
        JSON.stringify({
          event: "ai_simulation_v1_worker_runner_log",
          ts: new Date().toISOString(),
          message,
          ...meta,
        }),
      );
    },
    completeChat: (system, user) => completeAiSimulationChatFromEnv(system, user),
    getProfileForUser: (userId) => loadQuestionnaireProfileViewForAiJob(prisma, userId),
  };
}

/**
 * Poll at most one `queued` job, claim with `queued`→`running`, then run LLM pipeline.
 * Exported for unit tests with injected Prisma.
 */
/**
 * Stuck recovery: `job.updatedAt` is refreshed on claim (`queued`→`running`) and not updated again until
 * job `completed` in `runAiSimulationV1JobExecution` finally — so it approximates "running since" for MVP.
 */
export type RecoverStuckAiSimulationV1JobsOptions = {
  stuckTimeoutMs?: number;
  now?: Date;
};

export async function recoverStuckAiSimulationV1JobsOnce(
  prisma: PrismaClient,
  options?: RecoverStuckAiSimulationV1JobsOptions,
): Promise<void> {
  const stuckTimeoutMs = options?.stuckTimeoutMs ?? readStuckTimeoutMs();
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - stuckTimeoutMs);

  workerLog("ai_simulation_v1_worker_recovery_scan_start", {
    cutoff: cutoff.toISOString(),
    stuckTimeoutMs,
  });

  try {
    const stuck = await prisma.aiSimulationV1Job.findMany({
      where: {
        jobStatus: "running",
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const row of stuck) {
      try {
        const outcome = await prisma.$transaction(async (tx) => {
          const jobRes = await tx.aiSimulationV1Job.updateMany({
            where: {
              id: row.id,
              jobStatus: "running",
              updatedAt: { lt: cutoff },
            },
            data: { jobStatus: "queued" },
          });
          if (jobRes.count === 0) {
            return { recovered: false as const, itemsReset: 0 };
          }
          const itemRes = await tx.aiSimulationV1Item.updateMany({
            where: { jobId: row.id, status: "running" },
            data: { status: "queued" },
          });
          return { recovered: true as const, itemsReset: itemRes.count };
        });

        if (!outcome.recovered) {
          workerLog("ai_simulation_v1_worker_recovery_skip", {
            jobId: row.id,
            reason: "job_not_stale_or_state_changed",
          });
          continue;
        }
        workerLog("ai_simulation_v1_worker_recovered_stuck_job", {
          jobId: row.id,
          itemsRunningResetToQueued: outcome.itemsReset,
        });
      } catch (err: unknown) {
        workerLog("ai_simulation_v1_worker_recovery_error", {
          jobId: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err: unknown) {
    workerLog("ai_simulation_v1_worker_recovery_error", {
      phase: "scan",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function runAiSimulationV1WorkerPollOnce(prisma: PrismaClient): Promise<void> {
  workerLog("ai_simulation_v1_worker_poll_start");

  const job = await prisma.aiSimulationV1Job.findFirst({
    where: { jobStatus: "queued" },
    orderBy: { updatedAt: "asc" },
    select: { id: true, viewerUserId: true },
  });
  if (!job) {
    return;
  }

  const claimed = await prisma.aiSimulationV1Job.updateMany({
    where: { id: job.id, jobStatus: "queued" },
    data: { jobStatus: "running" },
  });

  if (claimed.count !== 1) {
    workerLog("ai_simulation_v1_worker_claim_lost", { jobId: job.id });
    return;
  }

  workerLog("ai_simulation_v1_worker_claimed", { jobId: job.id, viewerUserId: job.viewerUserId });

  const ports = buildPorts(prisma);
  try {
    await runAiSimulationV1JobExecution(ports, { jobId: job.id, viewerUserId: job.viewerUserId });
    workerLog("ai_simulation_v1_worker_completed", { jobId: job.id });
  } catch (err: unknown) {
    workerLog("ai_simulation_v1_worker_failed", {
      jobId: job.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Starts interval polling when AI simulation + worker flags are enabled. */
export function registerAiSimulationV1QueueWorker(): void {
  const simOn = truthyEnv(process.env.AI_SIMULATION_V1_ENABLED);
  const workerOn = truthyEnv(process.env.AI_SIMULATION_V1_WORKER_ENABLED);

  if (!simOn || !workerOn) {
    workerLog("ai_simulation_v1_worker_disabled", {
      AI_SIMULATION_V1_ENABLED: simOn ? "1" : "0",
      AI_SIMULATION_V1_WORKER_ENABLED: workerOn ? "1" : "0",
    });
    return;
  }

  const prisma = new PrismaClient();
  const pollMs = readPollMs();

  const recoveryPollMs = readRecoveryPollMs();
  const stuckTimeoutMs = readStuckTimeoutMs();

  workerLog("ai_simulation_v1_worker_started", { pollMs, recoveryPollMs, stuckTimeoutMs });

  const pollTimer = setInterval(() => {
    void runAiSimulationV1WorkerPollOnce(prisma).catch((err: unknown) => {
      workerLog("ai_simulation_v1_worker_poll_error", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, pollMs);

  const recoveryTimer = setInterval(() => {
    void recoverStuckAiSimulationV1JobsOnce(prisma).catch((err: unknown) => {
      workerLog("ai_simulation_v1_worker_recovery_error", {
        phase: "interval",
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, recoveryPollMs);

  const onShutdown = (): void => {
    clearInterval(pollTimer);
    clearInterval(recoveryTimer);
    void prisma.$disconnect();
  };
  process.once("SIGINT", onShutdown);
  process.once("SIGTERM", onShutdown);
}
