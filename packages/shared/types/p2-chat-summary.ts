import type { P2SourceTypeId } from "../constants/p2-source-type";

/** Shared metadata for rule/template/placeholder/hybrid provenance. */
export type P2SourceMetadata = {
  sourceType: P2SourceTypeId;
  /** Opaque version string for the generating rules/template set (e.g. "v1"). */
  sourceVersion: string;
};

/**
 * Chat conversation summary snapshot (API/worker shapes align to this; no logic here).
 * Copilot “basic suggestions” may reference the same metadata pattern.
 */
export type P2ChatSummarySnapshot = P2SourceMetadata & {
  conversationId: string;
  summary: string;
  /** Optional staged hint line; same semantic family as P1 chatStageHint. */
  chatStageHint?: string;
  generatedAt: string;
};
