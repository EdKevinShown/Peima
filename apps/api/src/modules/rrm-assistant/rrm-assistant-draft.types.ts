import type { RrmObservedSignalSummaryV1, RrmObservedSuggestedAction } from "../rrm-observed";
import { RRM_SOURCE_VERSION_ASSISTANT } from "../rrm-shared";
import type { RrmAssistantActionFitV1 } from "./rrm-assistant-action-fit";
import type {
  RrmAssistantADraftBucket,
  RrmAssistantDraftAdvancementType,
} from "./rrm-assistant-draft.constants";
import type { RrmAssistantSimContextHint } from "./rrm-assistant-action-fit";

export type RrmAssistantDraftDetectionV1 = {
  advancementDetected: boolean;
  advancementType: RrmAssistantDraftAdvancementType;
  A_draft_bucket: RrmAssistantADraftBucket;
  A_draft: number;
  /** Short reason tags for UI/logging; not formula vectors. */
  reasonTags: string[];
};

/** v1 draft assessment; ActionFit when advancement detected (M5.1-r8). */
export type RrmAssistantDraftAssessmentV1 = {
  schemaVersion: 1;
  sourceVersion: typeof RRM_SOURCE_VERSION_ASSISTANT;
  layer: "adapter";
  mode: "signal_summary_only" | "core_formula_output";
  fallbackUsed: boolean;
  insufficientData: boolean;
  unavailableReason: string | null;
  generatedAt: string;
  draftLength: number;
  detection: RrmAssistantDraftDetectionV1;
  /** Present when `advancementDetected` is false (tone-only path). */
  toneAdvice: string | null;
  suggestedAction: RrmObservedSuggestedAction | null;
  actionFit: RrmAssistantActionFitV1 | null;
};

export type BuildRrmAssistantDraftAssessmentInput = {
  draft: string;
  observedSummary?: RrmObservedSignalSummaryV1 | null;
  simHint?: RrmAssistantSimContextHint | null;
  generatedAt?: string;
};
