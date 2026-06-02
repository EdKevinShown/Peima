import type { PrismaClient } from "@peima/database";
import { Prisma } from "@peima/database";
import { isTestingObservabilityEnabled } from "./testing-observability-env";
import type { RecordTestingEventInput } from "./testing-observability.types";

type EventWriter = Pick<PrismaClient, "testingObservabilityEvent">;

/**
 * Best-effort test event log. Never throws; no-op when feature disabled.
 */
export async function recordTestingEvent(
  prisma: EventWriter,
  input: RecordTestingEventInput,
): Promise<void> {
  if (!isTestingObservabilityEnabled()) {
    return;
  }
  try {
    await prisma.testingObservabilityEvent.create({
      data: {
        userId: input.userId ?? null,
        matchResultId: input.matchResultId ?? null,
        eventType: input.eventType,
        status: input.status,
        source: input.source ?? null,
        sourceVersion: input.sourceVersion ?? null,
        fallbackUsed: input.fallbackUsed ?? null,
        errorCode: input.errorCode ?? null,
        message: input.message?.slice(0, 2000) ?? null,
        meta: input.meta ? (input.meta as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch {
    /* swallow — must not affect caller */
  }
}
