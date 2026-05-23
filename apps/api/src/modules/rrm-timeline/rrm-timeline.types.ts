import type { RrmObservedSuggestedAction } from "../rrm-observed";
import type { RrmCoreFormulaBranch, RrmSignalSummaryBaseV1 } from "../rrm-shared";
import { RRM_SOURCE_VERSION_TIMELINE } from "../rrm-shared";
import type { RrmTimelineAdvancementType } from "./rrm-timeline-window.detector";

export type RrmTimelineMessageInput = {
  senderUserId: string;
  content: string;
  createdAt: string | Date;
};

export type BuildRrmTimelineSignalSummaryInput = {
  conversationId: string;
  viewerUserId: string;
  counterpartyUserId: string;
  messages: RrmTimelineMessageInput[];
  generatedAt?: string;
};

export type RrmTimelineStage =
  | "early"
  | "building"
  | "stable_chat"
  | "invite_phase"
  | "cooling"
  | "risk";

export type RrmTimelinePaceTrend = "slowing" | "steady" | "accelerating" | "unknown";

export type RrmTimelineInitiativeBalance =
  | "viewer_led"
  | "balanced"
  | "counterparty_led"
  | "unknown";

export type RrmTimelineQualityTrend = "improving" | "flat" | "declining" | "unknown";

export type RrmTimelineConfidence = "low" | "medium" | "high";

export type RrmTimelineAdvancementWindowV1 = {
  windowId: string;
  windowStart: string;
  windowEnd: string;
  advancementType: RrmTimelineAdvancementType;
  messageCount: number;
  RFI_t: number;
  branch: RrmCoreFormulaBranch;
};

export type RrmTimelineSignalSummaryV1 = RrmSignalSummaryBaseV1 & {
  sourceVersion: typeof RRM_SOURCE_VERSION_TIMELINE;
  mode: "signal_summary_only" | "core_formula_output";
  conversationId: string;
  messageCount: number;
  viewerMessageCount: number;
  counterpartyMessageCount: number;
  stage: RrmTimelineStage;
  paceTrend: RrmTimelinePaceTrend;
  initiativeBalance: RrmTimelineInitiativeBalance;
  coldRisk: number;
  boundaryRisk: number;
  qualityTrend: RrmTimelineQualityTrend;
  confidence: RrmTimelineConfidence;
  suggestedAction: RrmObservedSuggestedAction;
  advancementWindowCount: number;
  windows: RrmTimelineAdvancementWindowV1[];
  rhythmTrend: RrmTimelineQualityTrend;
};
