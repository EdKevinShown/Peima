import type { RrmSignalSummaryBaseV1 } from "../rrm-shared";
import { RRM_SOURCE_VERSION_OBSERVED } from "../rrm-shared";

export type RrmObservedPace = "slow" | "steady" | "fast" | "unknown";

export type RrmObservedSuggestedAction =
  | "maintain"
  | "continue_lightly"
  | "slow_down"
  | "pause";

export type RrmObservedMessageInput = {
  senderUserId: string;
  content: string;
  createdAt: string | Date;
};

export type BuildRrmObservedSignalSummaryInput = {
  conversationId: string;
  viewerUserId: string;
  counterpartyUserId: string;
  messages: RrmObservedMessageInput[];
  generatedAt?: string;
};

/** Layer-2 observed signals; v1 does not emit RFI_obs. */
export type RrmObservedSignalSummaryV1 = RrmSignalSummaryBaseV1 & {
  sourceVersion: typeof RRM_SOURCE_VERSION_OBSERVED;
  mode: "signal_summary_only";
  conversationId: string;
  messageCount: number;
  viewerMessageCount: number;
  counterpartyMessageCount: number;
  advancementDetected: boolean;
  S_obs: number;
  E_obs: number;
  F_obs: number;
  Q_obs: number;
  D_obs: number;
  R_obs: number;
  coldRisk: number;
  pace: RrmObservedPace;
  suggestedAction: RrmObservedSuggestedAction;
};
