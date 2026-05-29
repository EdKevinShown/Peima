import { PrismaClient } from "@peima/database";
import {
  readPairwiseStuckTimeoutMs,
  recoverStuckAiPairwiseDecisionJobsOnce,
  runAiPairwiseDecisionWorkerPollOnce,
} from "./pairwise-worker-poll";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function readPollMs(): number {
  const raw = parseInt(process.env.AI_PAIRWISE_DECISION_WORKER_POLL_MS ?? "10000", 10);
  if (!Number.isFinite(raw) || raw < 1000) {
    return 10_000;
  }
  return Math.trunc(raw);
}

function readRecoveryPollMs(): number {
  const raw = parseInt(process.env.AI_PAIRWISE_DECISION_RECOVERY_POLL_MS ?? "60000", 10);
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

/** Starts interval polling when pairwise feature + worker flags are enabled. */
export function registerAiPairwiseDecisionQueueWorker(): void {
  const featureOn = truthyEnv(process.env.AI_PAIRWISE_DECISION_ENABLED);
  const workerOn = truthyEnv(process.env.AI_PAIRWISE_DECISION_WORKER_ENABLED);

  if (!featureOn || !workerOn) {
    workerLog("ai_pairwise_decision_worker_disabled", {
      AI_PAIRWISE_DECISION_ENABLED: featureOn ? "1" : "0",
      AI_PAIRWISE_DECISION_WORKER_ENABLED: workerOn ? "1" : "0",
    });
    return;
  }

  const prisma = new PrismaClient();
  const pollMs = readPollMs();
  const recoveryPollMs = readRecoveryPollMs();
  const stuckTimeoutMs = readPairwiseStuckTimeoutMs();

  workerLog("ai_pairwise_decision_worker_started", { pollMs, recoveryPollMs, stuckTimeoutMs });

  const pollTimer = setInterval(() => {
    void runAiPairwiseDecisionWorkerPollOnce(prisma).catch((err: unknown) => {
      workerLog("ai_pairwise_decision_worker_poll_error", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, pollMs);

  const recoveryTimer = setInterval(() => {
    void recoverStuckAiPairwiseDecisionJobsOnce(prisma).catch((err: unknown) => {
      workerLog("ai_pairwise_decision_worker_recovery_error", {
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
