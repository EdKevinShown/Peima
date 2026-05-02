import { Prisma, PrismaClient } from "@peima/database";
import { executeClaimedAiPairwiseDecisionJob } from "../../../apps/api/src/modules/ai-pairwise-decision/ai-pairwise-decision-job-execution";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../../../apps/api/src/modules/ai-pairwise-decision/ai-pairwise-decision-job.constants";
import { generateAiPairwiseDecisionFromEnv } from "./pairwise-generate-from-env";

function workerLog(event: string, extra: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...extra,
    }),
  );
}

/** Default 15m — must exceed worst-case single-job LLM duration to avoid false recovery. */
export function readPairwiseStuckTimeoutMs(): number {
  const raw = parseInt(process.env.AI_PAIRWISE_DECISION_STUCK_TIMEOUT_MS ?? "900000", 10);
  if (!Number.isFinite(raw) || raw < 60_000) {
    return 900_000;
  }
  return Math.trunc(raw);
}

export type RecoverStuckAiPairwiseDecisionJobsOptions = {
  stuckTimeoutMs?: number;
  now?: Date;
};

/**
 * Minimal stuck recovery: stale `running` → `queued` for worker reclaim.
 * Only updates `status` (does not clear `decisionResult` / `failureDetail`).
 */
export async function recoverStuckAiPairwiseDecisionJobsOnce(
  prisma: PrismaClient,
  options?: RecoverStuckAiPairwiseDecisionJobsOptions,
): Promise<{ resetCount: number }> {
  const stuckTimeoutMs = options?.stuckTimeoutMs ?? readPairwiseStuckTimeoutMs();
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - stuckTimeoutMs);

  workerLog("ai_pairwise_decision_worker_recovery_scan_start", {
    cutoff: cutoff.toISOString(),
    stuckTimeoutMs,
  });

  try {
    const res = await prisma.aiPairwiseDecisionJob.updateMany({
      where: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING,
        updatedAt: { lt: cutoff },
      },
      data: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
      },
    });

    const resetCount = res.count;
    if (resetCount > 0) {
      workerLog("ai_pairwise_decision_worker_recovery_reset", { resetCount });
    }
    return { resetCount };
  } catch (err: unknown) {
    workerLog("ai_pairwise_decision_worker_recovery_error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { resetCount: 0 };
  }
}

export type RunAiPairwiseDecisionWorkerPollOnceResult =
  | "idle"
  | "claim_lost"
  | "completed"
  | "execution_error";

/**
 * Poll at most one `queued` job, claim `queued`→`running`, then run shared execution body.
 */
export async function runAiPairwiseDecisionWorkerPollOnce(
  prisma: PrismaClient,
): Promise<RunAiPairwiseDecisionWorkerPollOnceResult> {
  workerLog("ai_pairwise_decision_worker_poll_start");

  const job = await prisma.aiPairwiseDecisionJob.findFirst({
    where: { status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
  });

  if (!job) {
    return "idle";
  }

  const claimed = await prisma.aiPairwiseDecisionJob.updateMany({
    where: { id: job.id, status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED },
    data: {
      status: AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING,
      startedAt: new Date(),
      failureDetail: Prisma.JsonNull,
      decisionResult: Prisma.JsonNull,
      finalSourceShadow: Prisma.JsonNull,
    },
  });

  if (claimed.count !== 1) {
    workerLog("ai_pairwise_decision_worker_claim_lost", { jobId: job.id });
    return "claim_lost";
  }

  workerLog("ai_pairwise_decision_worker_claimed", { jobId: job.id });

  try {
    const row = await prisma.aiPairwiseDecisionJob.findUniqueOrThrow({
      where: { id: job.id },
      select: { id: true, viewerUserId: true, poolId: true, shortlistSnapshot: true },
    });

    await executeClaimedAiPairwiseDecisionJob({
      db: prisma.aiPairwiseDecisionJob,
      jobId: row.id,
      viewerUserId: row.viewerUserId,
      poolId: row.poolId,
      shortlistSnapshot: row.shortlistSnapshot,
      generate: (sl) => generateAiPairwiseDecisionFromEnv(sl),
    });

    workerLog("ai_pairwise_decision_worker_completed", { jobId: job.id });
    return "completed";
  } catch (err: unknown) {
    workerLog("ai_pairwise_decision_worker_failed", {
      jobId: job.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return "execution_error";
  }
}
