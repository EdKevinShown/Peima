import { RRM_ADAPTER_LAYER, RRM_SIGNAL_SUMMARY_SCHEMA_VERSION, RRM_SOURCE_VERSION_ASSISTANT } from "../rrm-shared";
import type { RrmObservedSuggestedAction } from "../rrm-observed";
import { RRM_ASSISTANT_DRAFT_SCHEMA_VERSION } from "./rrm-assistant-draft.constants";
import { computeRrmAssistantActionFit } from "./rrm-assistant-action-fit";
import { detectRrmAssistantDraft } from "./rrm-assistant-draft.detector";
import type {
  BuildRrmAssistantDraftAssessmentInput,
  RrmAssistantDraftAssessmentV1,
} from "./rrm-assistant-draft.types";

function toneAdviceForNeutral(params: {
  coldRisk: number;
  R_obs: number;
}): { toneAdvice: string; suggestedAction: RrmObservedSuggestedAction } {
  if (params.R_obs >= 0.45 || params.coldRisk >= 0.55) {
    return {
      toneAdvice: "语气保持轻松、给对方空间，避免催促或施压。",
      suggestedAction: "slow_down",
    };
  }
  if (params.coldRisk >= 0.35) {
    return {
      toneAdvice: "先接住对方上一句，用开放式问题延续话题。",
      suggestedAction: "maintain",
    };
  }
  return {
    toneAdvice: "保持自然、简短，不必急于推进关系。",
    suggestedAction: "maintain",
  };
}

/**
 * M5.1-r7 — draft classification + tone-only path when no advancement.
 * ActionFit deferred to r8.
 */
export function buildRrmAssistantDraftAssessment(
  input: BuildRrmAssistantDraftAssessmentInput,
): RrmAssistantDraftAssessmentV1 {
  const draft = input.draft ?? "";
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const detection = detectRrmAssistantDraft(draft);

  if (!draft.trim()) {
    return {
      schemaVersion: RRM_ASSISTANT_DRAFT_SCHEMA_VERSION,
      sourceVersion: RRM_SOURCE_VERSION_ASSISTANT,
      layer: RRM_ADAPTER_LAYER.ADAPTER,
      mode: "signal_summary_only",
      fallbackUsed: true,
      insufficientData: true,
      unavailableReason: "insufficient_data",
      generatedAt,
      draftLength: 0,
      detection,
      toneAdvice: null,
      suggestedAction: null,
      actionFit: null,
    };
  }

  if (detection.advancementDetected) {
    const observed =
      input.observedSummary && !input.observedSummary.insufficientData
        ? input.observedSummary
        : null;
    const actionFit = computeRrmAssistantActionFit({
      draft: draft.trim(),
      detection,
      observedSummary: observed,
      simHint: input.simHint ?? null,
    });
    return {
      schemaVersion: RRM_ASSISTANT_DRAFT_SCHEMA_VERSION,
      sourceVersion: RRM_SOURCE_VERSION_ASSISTANT,
      layer: RRM_ADAPTER_LAYER.ADAPTER,
      mode: "core_formula_output",
      fallbackUsed: false,
      insufficientData: false,
      unavailableReason: null,
      generatedAt,
      draftLength: draft.trim().length,
      detection,
      toneAdvice: actionFit.toneAdvice,
      suggestedAction: actionFit.suggestedAction,
      actionFit,
    };
  }

  const obs = input.observedSummary;
  let toneAdvice: string | null = "保持自然、简短，不必急于推进关系。";
  let suggestedAction: RrmObservedSuggestedAction | null = "maintain";

  if (obs && !obs.insufficientData) {
    const t = toneAdviceForNeutral({
      coldRisk: typeof obs.coldRisk === "number" ? obs.coldRisk : 0,
      R_obs: typeof obs.R_obs === "number" ? obs.R_obs : 0,
    });
    toneAdvice = t.toneAdvice;
    suggestedAction = obs.suggestedAction ?? t.suggestedAction;
  }

  return {
    schemaVersion: RRM_ASSISTANT_DRAFT_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_ASSISTANT,
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    mode: "signal_summary_only",
    fallbackUsed: false,
    insufficientData: false,
    unavailableReason: null,
    generatedAt,
    draftLength: draft.trim().length,
    detection,
    toneAdvice,
    suggestedAction,
    actionFit: null,
  };
}
