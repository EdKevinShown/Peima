declare module "@peima/ai-simulation-v1-runner/worker-consumer" {
  import type { PrismaClient } from "@peima/database";

  export type RecoverStuckAiSimulationV1JobsOptions = {
    stuckTimeoutMs?: number;
    now?: Date;
  };

  export function registerAiSimulationV1QueueWorker(): void;
  export function runAiSimulationV1WorkerPollOnce(prisma: PrismaClient): Promise<void>;
  export function recoverStuckAiSimulationV1JobsOnce(
    prisma: PrismaClient,
    options?: RecoverStuckAiSimulationV1JobsOptions,
  ): Promise<void>;
}
