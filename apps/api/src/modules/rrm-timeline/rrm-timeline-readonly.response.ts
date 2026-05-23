import type { RrmTimelineSignalSummaryV1 } from "./rrm-timeline.types";
import { RRM_SOURCE_VERSION_TIMELINE } from "../rrm-shared";

export const RRM_TIMELINE_READONLY_HTTP_SCHEMA_VERSION = 1 as const;

export type RrmTimelineRhythmBand = "good" | "caution" | "avoid";

export type RrmTimelineAdvancementWindowViewerDto = {
  windowId: string;
  windowStart: string;
  windowEnd: string;
  advancementType: string;
  rhythmBand: RrmTimelineRhythmBand;
};

/** Viewer-safe — no raw RFI_t scalar (M5.0). */
export type RrmTimelineReadonlyHttpDto = {
  schemaVersion: typeof RRM_TIMELINE_READONLY_HTTP_SCHEMA_VERSION;
  sourceVersion: typeof RRM_SOURCE_VERSION_TIMELINE;
  mode: "readonly";
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  conversationId: string;
  participantUserId: string;
  stage: RrmTimelineSignalSummaryV1["stage"];
  paceTrend: RrmTimelineSignalSummaryV1["paceTrend"];
  initiativeBalance: RrmTimelineSignalSummaryV1["initiativeBalance"];
  coldRisk: number;
  boundaryRisk: number;
  qualityTrend: RrmTimelineSignalSummaryV1["qualityTrend"];
  rhythmTrend: RrmTimelineSignalSummaryV1["rhythmTrend"];
  confidence: RrmTimelineSignalSummaryV1["confidence"];
  suggestedAction: RrmTimelineSignalSummaryV1["suggestedAction"];
  advancementWindowCount: number;
  advancementWindows: RrmTimelineAdvancementWindowViewerDto[];
  insufficientData: boolean;
  unavailableReason: string | null;
};

function bandFromRfi(RFI_t: number, branch: "within_capacity" | "over_capacity"): RrmTimelineRhythmBand {
  if (branch === "over_capacity" || RFI_t < -0.05) return "avoid";
  if (RFI_t < 0.12) return "caution";
  return "good";
}

export function toRrmTimelineReadonlyHttpDto(params: {
  conversationId: string;
  participantUserId: string;
  summary: RrmTimelineSignalSummaryV1;
}): RrmTimelineReadonlyHttpDto {
  const { summary } = params;
  return {
    schemaVersion: RRM_TIMELINE_READONLY_HTTP_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_TIMELINE,
    mode: "readonly",
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    conversationId: params.conversationId,
    participantUserId: params.participantUserId,
    stage: summary.stage,
    paceTrend: summary.paceTrend,
    initiativeBalance: summary.initiativeBalance,
    coldRisk: summary.coldRisk,
    boundaryRisk: summary.boundaryRisk,
    qualityTrend: summary.qualityTrend,
    rhythmTrend: summary.rhythmTrend,
    confidence: summary.confidence,
    suggestedAction: summary.suggestedAction,
    advancementWindowCount: summary.advancementWindowCount,
    advancementWindows: summary.windows.map((w) => ({
      windowId: w.windowId,
      windowStart: w.windowStart,
      windowEnd: w.windowEnd,
      advancementType: w.advancementType,
      rhythmBand: bandFromRfi(w.RFI_t, w.branch),
    })),
    insufficientData: summary.insufficientData,
    unavailableReason: summary.unavailableReason,
  };
}
