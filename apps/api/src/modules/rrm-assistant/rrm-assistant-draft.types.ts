import type { RrmObservedSignalSummaryV1, RrmObservedSuggestedAction } from "../rrm-observed";
import { RRM_SOURCE_VERSION_ASSISTANT } from "../rrm-shared";
import type {
  RrmAssistantADraftBucket,
  RrmAssistantDraftAdvancementType,
} from "./rrm-assistant-draft.constants";

export type RrmAssistantDraftDetectionV1 = {
  advancementDetected: boolean;
  advancementType: RrmAssistantDraftAdvancementType;
  A_draft_bucket: RrmAssistantADraftBucket;
  A_draft: number;
  /** Short reason tags for UI/logging; not formula vectors. */
  reasonTags: string[];
};

/** v1 assessment without ActionFit (M5.1-r7). */
export type RrmAssistantDraftAssessmentV1 = {
  schemaVersion: 1;
  sourceVersion: typeof RRM_SOURCE_VERSION_ASSISTANT;
  layer: "adapter";
  mode: "signal_summary_only";
  fallbackUsed: boolean;
  insufficientData: boolean;
  unavailableReason: string | null;
  generatedAt: string;
  draftLength: number;
  detection: RrmAssistantDraftDetectionV1;
  /** Present when `advancementDetected` is false (tone-only path). */
  toneAdvice: string | null;
  suggestedAction: RrmObservedSuggestedAction | null;
  /** Always null in r7; populated in r8 when ActionFit runs. */
  actionFit: null;
};

export type BuildRrmAssistantDraftAssessmentInput = {
  draft: string;
  /** Optional observed summary to inform tone-only suggestions. */
  observedSummary?: Pick<
    RrmObservedSignalSummaryV1,
    "coldRisk" | "R_obs" | "suggestedAction" | "insufficientData"
  > | null;
  generatedAt?: string;
};
