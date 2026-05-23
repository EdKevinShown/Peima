import type { RrmObservedSignalSummaryV1 } from "./rrm-observed.types";
import { RRM_SOURCE_VERSION_OBSERVED } from "../rrm-shared";

export const RRM_OBSERVED_READONLY_HTTP_SCHEMA_VERSION = 1 as const;

/** GET /chat/conversations/:conversationId/rrm-observed-summary — viewer-safe readonly envelope. */
export type RrmObservedReadonlyHttpDto = {
  schemaVersion: typeof RRM_OBSERVED_READONLY_HTTP_SCHEMA_VERSION;
  sourceVersion: typeof RRM_SOURCE_VERSION_OBSERVED;
  mode: "readonly";
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  conversationId: string;
  /** JWT participant requesting the summary (may be viewer or candidate on the row). */
  participantUserId: string;
  counterpartyUserId: string;
  observed: RrmObservedSignalSummaryV1;
};
