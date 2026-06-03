import type { PrismaService } from "../../common/prisma/prisma.service";
import { recordTestingEvent } from "./record-testing-event";

const LOOKBACK_MS = 15 * 60 * 1000;

export type BatchMatchObservabilityChannel =
  | "admin_batch_match"
  | "test_batch_match";

export async function recordBatchMatchRunToTestingObservability(
  prisma: PrismaService,
  input: {
    triggeredByUserId: string;
    channel: BatchMatchObservabilityChannel;
    subprocessOk: boolean;
    subprocessError?: string;
  },
): Promise<void> {
  await recordTestingEvent(prisma, {
    userId: input.triggeredByUserId,
    eventType: "batch_match_trigger",
    status: input.subprocessOk ? "success" : "failed",
    source: input.channel,
    message: input.subprocessOk
      ? "batch-match subprocess finished"
      : (input.subprocessError?.slice(0, 2000) ?? "batch-match subprocess failed"),
    meta: { channel: input.channel },
  });

  const since = new Date(Date.now() - LOOKBACK_MS);

  const batch = await prisma.matchBatch.findFirst({
    orderBy: { createdAt: "desc" },
    where: { createdAt: { gte: since } },
  });

  if (batch) {
    await recordTestingEvent(prisma, {
      userId: input.triggeredByUserId,
      eventType: "batch_match_summary",
      status:
        batch.status === "completed" && batch.successCount > 0
          ? "success"
          : batch.failedCount > 0 && batch.successCount === 0
            ? "failed"
            : "pending",
      source: input.channel,
      message: `batch ${batch.id} status=${batch.status} ok=${batch.successCount} fail=${batch.failedCount} total=${batch.totalUsers}`,
      meta: {
        batchId: batch.id,
        batchStatus: batch.status,
        successCount: batch.successCount,
        failedCount: batch.failedCount,
        totalUsers: batch.totalUsers,
      },
    });
  }

  const queues = await prisma.batchMatchQueue.findMany({
    where: { updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  for (const q of queues) {
    const queueStatus =
      q.status === "matched"
        ? "success"
        : q.status === "failed"
          ? "failed"
          : "pending";

    let matchResultId: string | null = null;
    if (q.batchId && q.status === "matched") {
      const mr = await prisma.matchResult.findFirst({
        where: { userId: q.userId, batchId: q.batchId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      matchResultId = mr?.id ?? null;
    }

    await recordTestingEvent(prisma, {
      userId: q.userId,
      matchResultId,
      eventType: "batch_match_queue",
      status: queueStatus,
      source: input.channel,
      errorCode: q.status === "failed" ? "queue_failed" : null,
      message: `queue=${q.id} status=${q.status} batchId=${q.batchId ?? "null"}`,
      meta: {
        queueId: q.id,
        batchId: q.batchId,
        triggeredByUserId: input.triggeredByUserId,
        channel: input.channel,
      },
    });
  }
}
