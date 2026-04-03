import type { P2SourceTypeId } from "../constants/p2-source-type";

/**
 * Append-only friendly behavior signal for analytics / downstream jobs.
 */
export type P2BehaviorSignal = {
  userId: string;
  eventType: string;
  sourceType: P2SourceTypeId;
  sourceVersion: string;
  occurredAt: string;
  conversationId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
};
