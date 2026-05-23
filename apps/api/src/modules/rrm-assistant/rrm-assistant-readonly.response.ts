import type { RrmAssistantDraftAssessmentV1 } from "./rrm-assistant-draft.types";
import { RRM_SOURCE_VERSION_ASSISTANT } from "../rrm-shared";

export const RRM_ASSISTANT_READONLY_HTTP_SCHEMA_VERSION = 1 as const;

/** Viewer-safe slice — no raw actionFit scalar (M5.0). */
export type RrmAssistantActionFitViewerDto = {
  suitabilityBand: "good" | "caution" | "avoid";
  branch: "within_capacity" | "over_capacity";
  suggestedAction: string;
  toneAdvice: string;
};

export type RrmAssistantDraftAssessmentHttpDto = {
  schemaVersion: typeof RRM_ASSISTANT_READONLY_HTTP_SCHEMA_VERSION;
  sourceVersion: typeof RRM_SOURCE_VERSION_ASSISTANT;
  mode: "readonly";
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  conversationId: string;
  participantUserId: string;
  advancementDetected: boolean;
  A_draft_bucket: string;
  actionFit: RrmAssistantActionFitViewerDto | null;
  toneAdvice: string | null;
  suggestedAction: string | null;
};

export function toViewerActionFit(
  assessment: RrmAssistantDraftAssessmentV1,
): RrmAssistantActionFitViewerDto | null {
  const fit = assessment.actionFit;
  if (!fit) return null;
  return {
    suitabilityBand: fit.suitabilityBand,
    branch: fit.branch,
    suggestedAction: fit.suggestedAction,
    toneAdvice: fit.toneAdvice,
  };
}
