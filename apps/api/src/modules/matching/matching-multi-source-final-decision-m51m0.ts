import type { MatchResult } from "@peima/database";
import { RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS_SET } from "../rrm-shared";
import { buildGuardrailsReadonly } from "./matching-guardrails-readonly";
import { RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY } from "./matching-rrm-sim-readonly-summary";
import type {
  MatchResultDisplayFields,
  MatchResultDisplaySourceType,
  ViewerSafeFinalMatchDecisionMeta,
} from "./matching-result-display";

export { RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY };

/** M5.1-M0/M1/M2 + M5.2-M0/M3 — readonly sidecar (+ optional shadow contract / shadow proposal); does not participate in display resolution. */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION = 1 as const;

/** Bumped M5.2-M3: shadow contract + optional shadow display proposal (never applied server-side). */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION =
  "m5.2-m3-multi-source-final-decision-shadow-proposal-v1" as const;

export type MultiSourceDecisionTraceStepReadonly =
  | "source_hydration_readonly"
  | "rrm_sim_source_discovery_readonly"
  | "shadow_contract_readonly";

export type MultiSourceDecisionTraceEntryReadonly = {
  step: MultiSourceDecisionTraceStepReadonly;
  detail: string;
};

export type MultiSourceBaselineReadonly = {
  matchResultCandidateUserId: string;
  finalScore: number | null;
  sourceType: "match_result_baseline";
};

export type MultiSourceStaticSourceReadonly = {
  available: true;
  candidateUserId: string;
  summary: string;
};

export type MultiSourcePairwiseSourceUnavailableReadonly = {
  available: false;
  summary: string;
};

export type MultiSourcePairwiseSourceAvailableReadonly = {
  available: true;
  selectedCandidateUserId: string;
  pairwiseWinnerCandidateUserId: string | null;
  staticTop1CandidateUserId: string;
  sourceType: string;
  mode: string;
  pairwiseProposalRecommendation: string;
  fallbackReason: string | null;
  wouldChangeStaticResult: boolean;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
  frozen: boolean;
  frozenAt: string | null;
};

export type MultiSourcePairwiseSourceReadonly =
  | MultiSourcePairwiseSourceUnavailableReadonly
  | MultiSourcePairwiseSourceAvailableReadonly;

export type MultiSourceRrmSimUnavailableReasonReadonly =
  | "no_viewer_safe_rrm_sim_summary_in_match_result_payload"
  | "rrm_sim_exists_only_in_observability_or_batch_context"
  | "rrm_sim_requires_shadow_or_m5_2_wiring";

export type MultiSourceRrmSimUnavailableReadonly = {
  available: false;
  summary: string;
  unavailableReason: MultiSourceRrmSimUnavailableReasonReadonly;
};

export type MultiSourceRrmSimAvailableReadonly = {
  available: true;
  summary: string;
  candidateUserId: string | null;
  sourceType: string;
  sourceVersion: string;
  fallbackUsed: boolean;
  unavailableReason: string | null;
  recommendation: string | null;
  suggestedAction: string | null;
  progressionWindow: string | null;
  simulatedRhythmScore: number | null;
  cautionFlags: string[];
  confidenceBucket: "low" | "medium" | "high" | "unknown";
  scenarioKey: string | null;
  generatedAt: string | null;
  frozenAt: string | null;
};

export type MultiSourceRrmSimSourceReadonly =
  | MultiSourceRrmSimUnavailableReadonly
  | MultiSourceRrmSimAvailableReadonly;

export type MultiSourceGuardrailsSourceReadonly = {
  /** `pass` = no caution signals (M5.2-M3 shadow may proceed when other sources allow). */
  status: "pass" | "not_evaluated" | "caution" | "block";
  blockReasons: string[];
  cautionReasons: string[];
  sourceSummary: string;
};

export type MultiSourceFinalDecisionAdminReadonly = {
  decisionTrace: MultiSourceDecisionTraceEntryReadonly[];
  missingSources: string[];
  notes: string[];
};

export type MultiSourceFinalDecisionSourcesReadonly = {
  static: MultiSourceStaticSourceReadonly;
  pairwise: MultiSourcePairwiseSourceReadonly;
  rrmSim: MultiSourceRrmSimSourceReadonly;
  guardrails: MultiSourceGuardrailsSourceReadonly;
};

/** M5.2-M0 / M5.2-M3: shadow contract + optional shadow display proposal (never applied server-side). */
export type MultiSourceShadowContractM52M0Readonly = {
  shadowModeRequested: boolean;
  /** True when `shadowModeRequested` and contract slice was attached for this response. */
  shadowContractEvaluated: boolean;
  /** M5.2-M3: true once shadow proposal rules were evaluated in shadow mode. */
  shadowDisplayProposalComputed: boolean;
  /** Echo of `m5ProposedDisplayCandidateUserId` (shadow-only). */
  proposedDisplayCandidateUserId: string | null;
  /** Echo of top-level `wouldChangeCurrentDisplay` when shadow mode is on. */
  wouldChangeCurrentDisplay: boolean;
  appliedToDisplay: false;
  noProposalReason: string | null;
  /** Sources that blocked the shadow proposal (subset of admin missing / guard rules). */
  sourcesBlockingShadowProposal: string[];
  /** Canonical short code: `pairwise_rrm_consensus`, `pairwise_unavailable`, etc. */
  reason: string | null;
  /** Viewer-safe labels for sources that hydrated for this response. */
  availableSources: string[];
  /** Gaps relevant to the shadow proposal outcome (often mirrors `sourcesBlockingShadowProposal`). */
  missingSources: string[];
  /** Echo of top-level `decisionRule` when shadow mode is on; null in readonly mode. */
  decisionRule: string | null;
  /** When `guardrails.status === "caution"` and a consensus proposal exists, echo viewer-safe caution lines. */
  shadowCautionReasonsEcho: string[];
  nextMilestonesNote: string;
};

export type MultiSourceFinalDecisionReadonlyDecisionRule =
  | "current_display_preserved_readonly"
  | "shadow_no_change_due_to_insufficient_m5_sources"
  | "shadow_pairwise_unavailable_current_display_preserved"
  | "shadow_rrm_sim_unavailable_current_display_preserved"
  | "shadow_guardrail_block_current_display_preserved"
  | "shadow_guardrail_not_evaluated_current_display_preserved"
  | "shadow_pairwise_rrm_conflict_current_display_preserved"
  | "shadow_pairwise_rrm_consensus";

export type MultiSourceFinalDecisionReadonlyM51M0 = {
  schemaVersion: typeof MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION;
  sourceVersion: typeof MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION;
  /** `readonly` unless `PEIMA_M5_FINAL_DECISION_SHADOW_ENABLED` requests shadow contract surface. */
  mode: "readonly" | "shadow";
  baseline: MultiSourceBaselineReadonly;
  /** Mirrors resolved `displayCandidateUserId` after existing finalize logic. */
  currentDisplayCandidateUserId: string;
  /** Mirrors resolved `displaySourceType`. */
  currentDisplaySourceType: MatchResultDisplaySourceType;
  /** M5.2-M3: shadow-only proposed display candidate; never applied here (`m5AppliedToDisplay` stays false). */
  m5ProposedDisplayCandidateUserId: string | null;
  /** M5.2-M0 / M5.2-M3: never applies M5 synthesis to display. */
  m5AppliedToDisplay: false;
  wouldChangeCurrentDisplay: boolean;
  decisionRule: MultiSourceFinalDecisionReadonlyDecisionRule;
  sources: MultiSourceFinalDecisionSourcesReadonly;
  shadow: MultiSourceShadowContractM52M0Readonly;
  admin: MultiSourceFinalDecisionAdminReadonly;
};

export type BuildMultiSourceFinalDecisionOptions = {
  /** From `readM5FinalDecisionShadowEnabled()` in service; default false in builder. */
  shadowEnabled?: boolean;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function pickRrmSimUnavailable(
  matchInsights: unknown,
): { block: MultiSourceRrmSimUnavailableReadonly; discoveryDetail: string } {
  if (!isRecord(matchInsights)) {
    return {
      block: {
        available: false,
        summary: "match_insights_absent",
        unavailableReason: "no_viewer_safe_rrm_sim_summary_in_match_result_payload",
      },
      discoveryDetail: "no_viewer_safe_rrm_sim_summary_in_match_result_payload",
    };
  }
  const exp = matchInsights.explanation;
  const hasRhythmPlaceholder =
    isRecord(exp) &&
    typeof exp.rhythmPrediction === "string" &&
    exp.rhythmPrediction.trim().length > 0;
  if (hasRhythmPlaceholder) {
    return {
      block: {
        available: false,
        summary: "placeholder_rhythm_copy_only_not_rrm_sim_v1",
        unavailableReason: "rrm_sim_requires_shadow_or_m5_2_wiring",
      },
      discoveryDetail: "rhythm_prediction_placeholder_without_rrm_sim_readonly_summary",
    };
  }
  return {
    block: {
      available: false,
      summary: "rrm_sim_on_simulation_jobs_and_admin_only_in_current_stack",
      unavailableReason: "rrm_sim_exists_only_in_observability_or_batch_context",
    },
    discoveryDetail: "rrm_sim_exists_only_in_observability_or_batch_context",
  };
}

/**
 * Parse embedded viewer-safe RRM-Sim summary on `matchInsights.rrmSimReadonlySummary` only.
 * Does not call evaluator, ranking service, or DB.
 */
export function tryParseRrmSimReadonlySummaryFromMatchInsights(
  matchInsights: unknown,
): MultiSourceRrmSimAvailableReadonly | null {
  if (!isRecord(matchInsights)) return null;
  const raw = matchInsights[RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY];
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== 1) return null;
  const sourceVersion = typeof raw.sourceVersion === "string" ? raw.sourceVersion.trim() : "";
  if (!sourceVersion || !RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS_SET.has(sourceVersion)) {
    return null;
  }
  const suggestedAction = typeof raw.suggestedAction === "string" ? raw.suggestedAction.trim() : null;
  const progressionWindow = typeof raw.progressionWindow === "string" ? raw.progressionWindow.trim() : null;
  const simulatedRhythmScore =
    typeof raw.simulatedRhythmScore === "number" && Number.isFinite(raw.simulatedRhythmScore)
      ? raw.simulatedRhythmScore
      : null;
  if (!suggestedAction && !progressionWindow && simulatedRhythmScore == null) {
    return null;
  }

  const candidateUserId =
    typeof raw.candidateUserId === "string"
      ? raw.candidateUserId.trim() || null
      : typeof raw.winnerUserId === "string"
        ? raw.winnerUserId.trim() || null
        : typeof raw.proposalCandidateUserId === "string"
          ? raw.proposalCandidateUserId.trim() || null
          : null;

  const sourceType = typeof raw.sourceType === "string" ? raw.sourceType.trim().slice(0, 120) : "rrm_sim_readonly_summary";

  const fallbackUsed = raw.fallbackUsed === true;
  const unavailableReason =
    raw.unavailableReason == null
      ? null
      : typeof raw.unavailableReason === "string"
        ? raw.unavailableReason.trim().slice(0, 200) || null
        : null;

  const recommendation =
    typeof raw.recommendation === "string" ? raw.recommendation.trim().slice(0, 400) : null;

  const cautionFlags: string[] = [];
  if (Array.isArray(raw.cautionFlags)) {
    for (const x of raw.cautionFlags) {
      if (typeof x === "string" && x.trim()) cautionFlags.push(x.trim().slice(0, 120));
      if (cautionFlags.length >= 16) break;
    }
  }

  let confidenceBucket: MultiSourceRrmSimAvailableReadonly["confidenceBucket"] = "unknown";
  if (raw.confidenceBucket === "low" || raw.confidenceBucket === "medium" || raw.confidenceBucket === "high") {
    confidenceBucket = raw.confidenceBucket;
  }

  const scenarioKey =
    typeof raw.scenarioKey === "string" && raw.scenarioKey.trim() ? raw.scenarioKey.trim().slice(0, 80) : null;
  const generatedAt =
    typeof raw.generatedAt === "string" && raw.generatedAt.trim() ? raw.generatedAt.trim().slice(0, 40) : null;
  const frozenAt =
    typeof raw.frozenAt === "string" && raw.frozenAt.trim() ? raw.frozenAt.trim().slice(0, 40) : null;

  return {
    available: true,
    summary: "hydrated_from_match_insights_rrm_sim_readonly_summary",
    candidateUserId,
    sourceType,
    sourceVersion,
    fallbackUsed,
    unavailableReason,
    recommendation,
    suggestedAction,
    progressionWindow,
    simulatedRhythmScore,
    cautionFlags,
    confidenceBucket,
    scenarioKey,
    generatedAt,
    frozenAt,
  };
}

function discoverRrmSimReadonly(matchRow: MatchResult): {
  rrmSim: MultiSourceRrmSimSourceReadonly;
  discoveryDetail: string;
} {
  const insights = matchRow.matchInsights;
  const parsed = tryParseRrmSimReadonlySummaryFromMatchInsights(insights);
  if (parsed) {
    return {
      rrmSim: parsed,
      discoveryDetail: "hydrated_from_match_insights_rrm_sim_readonly_summary",
    };
  }
  if (isRecord(insights) && insights[RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY] != null) {
    return {
      rrmSim: {
        available: false,
        summary: "rrm_sim_readonly_summary_present_but_invalid_contract",
        unavailableReason: "no_viewer_safe_rrm_sim_summary_in_match_result_payload",
      },
      discoveryDetail: "no_viewer_safe_rrm_sim_summary_in_match_result_payload",
    };
  }
  const { block, discoveryDetail } = pickRrmSimUnavailable(insights);
  return { rrmSim: block, discoveryDetail };
}

function buildPairwiseSourceReadonly(
  meta: ViewerSafeFinalMatchDecisionMeta | null,
): MultiSourcePairwiseSourceReadonly {
  if (!meta) {
    return {
      available: false,
      summary: "no_finalize_meta_on_matching_result_response",
    };
  }
  return {
    available: true,
    selectedCandidateUserId: meta.selectedCandidateUserId,
    pairwiseWinnerCandidateUserId: meta.pairwiseWinnerCandidateUserId,
    staticTop1CandidateUserId: meta.staticTop1CandidateUserId,
    sourceType: meta.sourceType,
    mode: meta.mode,
    pairwiseProposalRecommendation: meta.pairwiseProposalRecommendation,
    fallbackReason: meta.fallbackReason,
    wouldChangeStaticResult: meta.wouldChangeStaticResult,
    appliedToFinalScore: meta.appliedToFinalScore,
    appliedToWorkerRanking: meta.appliedToWorkerRanking,
    frozen: meta.frozen,
    frozenAt: meta.frozenAt,
  };
}

function buildMissingSourcesReadonly(input: {
  pairwiseAvailable: boolean;
  guardrailStatus: MultiSourceGuardrailsSourceReadonly["status"];
  rrmSimAvailable: boolean;
}): string[] {
  const out: string[] = [];
  if (!input.rrmSimAvailable) {
    out.push("rrm_sim");
  }
  if (!input.pairwiseAvailable) {
    out.push("pairwise_finalize_meta");
  }
  if (input.guardrailStatus === "not_evaluated") {
    out.push("guardrails_explicit_signal");
  }
  return out;
}

function extractPairwiseShadowCandidate(pairwise: MultiSourcePairwiseSourceReadonly): string | null {
  if (!pairwise.available) return null;
  const w = pairwise.pairwiseWinnerCandidateUserId?.trim();
  if (w) return w;
  const s = pairwise.selectedCandidateUserId?.trim();
  if (s) return s;
  return null;
}

function extractRrmSimShadowCandidate(rrmSim: MultiSourceRrmSimSourceReadonly): string | null {
  if (!rrmSim.available) return null;
  const c = rrmSim.candidateUserId?.trim();
  if (c) return c;
  return null;
}

function buildAvailableSourcesLabels(input: {
  pairwiseAvailable: boolean;
  rrmSimAvailable: boolean;
}): string[] {
  const out: string[] = ["match_result_baseline"];
  if (input.pairwiseAvailable) out.push("pairwise_finalize_meta");
  if (input.rrmSimAvailable) out.push("rrm_sim");
  return out;
}

function computeM52M3ShadowProposal(input: {
  currentDisplayCandidateUserId: string;
  pairwise: MultiSourcePairwiseSourceReadonly;
  rrmSim: MultiSourceRrmSimSourceReadonly;
  guardrails: MultiSourceGuardrailsSourceReadonly;
  missingSourcesAdmin: string[];
}): {
  m5ProposedDisplayCandidateUserId: string | null;
  wouldChangeCurrentDisplay: boolean;
  decisionRule: MultiSourceFinalDecisionReadonlyDecisionRule;
  shadowReason: string | null;
  noProposalReason: string | null;
  sourcesBlockingShadowProposal: string[];
  shadowMissingSources: string[];
  shadowCautionReasonsEcho: string[];
  shadowTraceDetail: string;
} {
  const current = input.currentDisplayCandidateUserId.trim();
  const pwCand = extractPairwiseShadowCandidate(input.pairwise);
  const rrmCand = extractRrmSimShadowCandidate(input.rrmSim);

  const fail = (params: {
    decisionRule: MultiSourceFinalDecisionReadonlyDecisionRule;
    shadowReason: string;
    noProposalReason: string;
    sourcesBlockingShadowProposal: string[];
    shadowTraceDetail: string;
  }) => ({
    m5ProposedDisplayCandidateUserId: null as string | null,
    wouldChangeCurrentDisplay: false,
    decisionRule: params.decisionRule,
    shadowReason: params.shadowReason,
    noProposalReason: params.noProposalReason,
    sourcesBlockingShadowProposal: params.sourcesBlockingShadowProposal,
    shadowMissingSources: params.sourcesBlockingShadowProposal,
    shadowCautionReasonsEcho: [] as string[],
    shadowTraceDetail: params.shadowTraceDetail,
  });

  if (!input.pairwise.available || !pwCand) {
    return fail({
      decisionRule: "shadow_pairwise_unavailable_current_display_preserved",
      shadowReason: "pairwise_unavailable",
      noProposalReason: "pairwise_unavailable",
      sourcesBlockingShadowProposal: [
        ...new Set([...input.missingSourcesAdmin, "pairwise_finalize_meta"]),
      ],
      shadowTraceDetail: "m52m3_shadow_pairwise_unavailable",
    });
  }

  if (!input.rrmSim.available || !rrmCand) {
    return fail({
      decisionRule: "shadow_rrm_sim_unavailable_current_display_preserved",
      shadowReason: "rrm_sim_unavailable",
      noProposalReason: "rrm_sim_unavailable",
      sourcesBlockingShadowProposal: [...new Set([...input.missingSourcesAdmin, "rrm_sim"])],
      shadowTraceDetail: "m52m3_shadow_rrm_sim_unavailable",
    });
  }

  if (input.guardrails.status === "block") {
    return fail({
      decisionRule: "shadow_guardrail_block_current_display_preserved",
      shadowReason: "guardrail_block",
      noProposalReason: "guardrail_block",
      sourcesBlockingShadowProposal: ["guardrails_block"],
      shadowTraceDetail: "m52m3_shadow_guardrail_block",
    });
  }

  if (input.guardrails.status === "not_evaluated") {
    return fail({
      decisionRule: "shadow_guardrail_not_evaluated_current_display_preserved",
      shadowReason: "guardrail_not_evaluated",
      noProposalReason: "guardrail_not_evaluated",
      sourcesBlockingShadowProposal: ["guardrails_not_evaluated"],
      shadowTraceDetail: "m52m3_shadow_guardrail_not_evaluated",
    });
  }

  if (input.guardrails.status !== "pass" && input.guardrails.status !== "caution") {
    return fail({
      decisionRule: "shadow_guardrail_not_evaluated_current_display_preserved",
      shadowReason: "guardrail_not_evaluated",
      noProposalReason: "guardrail_not_evaluated",
      sourcesBlockingShadowProposal: ["guardrails_status_unsupported"],
      shadowTraceDetail: "m52m3_shadow_guardrail_unsupported",
    });
  }

  if (pwCand !== rrmCand) {
    return fail({
      decisionRule: "shadow_pairwise_rrm_conflict_current_display_preserved",
      shadowReason: "pairwise_rrm_conflict",
      noProposalReason: "pairwise_rrm_conflict",
      sourcesBlockingShadowProposal: ["pairwise_rrm_mismatch"],
      shadowTraceDetail: "m52m3_shadow_pairwise_rrm_conflict",
    });
  }

  const consensus = pwCand;
  const wouldChange = consensus !== current;
  const shadowCautionReasonsEcho =
    input.guardrails.status === "caution" ? input.guardrails.cautionReasons.slice(0, 8) : [];

  return {
    m5ProposedDisplayCandidateUserId: consensus,
    wouldChangeCurrentDisplay: wouldChange,
    decisionRule: "shadow_pairwise_rrm_consensus",
    shadowReason: "pairwise_rrm_consensus",
    noProposalReason: null,
    sourcesBlockingShadowProposal: [],
    shadowMissingSources: [],
    shadowCautionReasonsEcho,
    shadowTraceDetail: "m52m3_shadow_pairwise_rrm_consensus",
  };
}

/**
 * M5.1-M0/M1/M2 + M5.2-M0: readonly multi-source sidecar — display echo + hydration + optional shadow **contract**.
 * Must not alter `displayCandidateUserId` / `displaySourceType` resolution.
 */
export function buildMultiSourceFinalDecisionReadonlyM51M0(
  matchRow: MatchResult,
  display: MatchResultDisplayFields,
  options?: BuildMultiSourceFinalDecisionOptions,
): MultiSourceFinalDecisionReadonlyM51M0 {
  const shadowEnabled = options?.shadowEnabled === true;
  const meta = display.finalMatchDecisionMeta;
  const pairwise = buildPairwiseSourceReadonly(meta);
  const guardrails = buildGuardrailsReadonly(meta, matchRow);
  const { rrmSim, discoveryDetail } = discoverRrmSimReadonly(matchRow);
  const missingSources = buildMissingSourcesReadonly({
    pairwiseAvailable: pairwise.available === true,
    guardrailStatus: guardrails.status,
    rrmSimAvailable: rrmSim.available === true,
  });

  const decisionTrace: MultiSourceDecisionTraceEntryReadonly[] = [
    {
      step: "source_hydration_readonly",
      detail: "m51m1_viewer_safe_fields_only",
    },
    {
      step: "rrm_sim_source_discovery_readonly",
      detail: discoveryDetail,
    },
  ];

  const availableSources = buildAvailableSourcesLabels({
    pairwiseAvailable: pairwise.available === true,
    rrmSimAvailable: rrmSim.available === true,
  });

  let m5ProposedDisplayCandidateUserId: string | null = null;
  let wouldChangeCurrentDisplay = false;
  let decisionRule: MultiSourceFinalDecisionReadonlyM51M0["decisionRule"] =
    "current_display_preserved_readonly";
  let shadowTraceDetail = "m52m0_shadow_mode_disabled";

  const m52Shadow = shadowEnabled
    ? computeM52M3ShadowProposal({
        currentDisplayCandidateUserId: display.displayCandidateUserId,
        pairwise,
        rrmSim,
        guardrails,
        missingSourcesAdmin: missingSources,
      })
    : null;

  if (shadowEnabled && m52Shadow) {
    m5ProposedDisplayCandidateUserId = m52Shadow.m5ProposedDisplayCandidateUserId;
    wouldChangeCurrentDisplay = m52Shadow.wouldChangeCurrentDisplay;
    decisionRule = m52Shadow.decisionRule;
    shadowTraceDetail = m52Shadow.shadowTraceDetail;
  }

  const shadow: MultiSourceShadowContractM52M0Readonly = shadowEnabled
    ? {
        shadowModeRequested: true,
        shadowContractEvaluated: true,
        shadowDisplayProposalComputed: true,
        proposedDisplayCandidateUserId: m52Shadow!.m5ProposedDisplayCandidateUserId,
        wouldChangeCurrentDisplay: m52Shadow!.wouldChangeCurrentDisplay,
        appliedToDisplay: false,
        noProposalReason: m52Shadow!.noProposalReason,
        sourcesBlockingShadowProposal: m52Shadow!.sourcesBlockingShadowProposal,
        reason: m52Shadow!.shadowReason,
        availableSources,
        missingSources: m52Shadow!.shadowMissingSources,
        decisionRule,
        shadowCautionReasonsEcho: m52Shadow!.shadowCautionReasonsEcho,
        nextMilestonesNote: "M5.3 enabled display is required before applying this proposal.",
      }
    : {
        shadowModeRequested: false,
        shadowContractEvaluated: false,
        shadowDisplayProposalComputed: false,
        proposedDisplayCandidateUserId: null,
        wouldChangeCurrentDisplay: false,
        appliedToDisplay: false,
        noProposalReason: "shadow_mode_disabled",
        sourcesBlockingShadowProposal: [],
        reason: null,
        availableSources: [],
        missingSources: [],
        decisionRule: null,
        shadowCautionReasonsEcho: [],
        nextMilestonesNote:
          "Set PEIMA_M5_FINAL_DECISION_SHADOW_ENABLED=true to surface shadow contract without changing display.",
      };

  if (shadowEnabled) {
    decisionTrace.push({
      step: "shadow_contract_readonly",
      detail: shadowTraceDetail,
    });
  }

  const mode: MultiSourceFinalDecisionReadonlyM51M0["mode"] = shadowEnabled ? "shadow" : "readonly";

  return {
    schemaVersion: MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION,
    sourceVersion: MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION,
    mode,
    baseline: {
      matchResultCandidateUserId: matchRow.candidateUserId,
      finalScore: matchRow.finalScore,
      sourceType: "match_result_baseline",
    },
    currentDisplayCandidateUserId: display.displayCandidateUserId,
    currentDisplaySourceType: display.displaySourceType,
    m5ProposedDisplayCandidateUserId,
    m5AppliedToDisplay: false,
    wouldChangeCurrentDisplay,
    decisionRule,
    sources: {
      static: {
        available: true,
        candidateUserId: matchRow.candidateUserId,
        summary: "hydrated_from_match_result_row",
      },
      pairwise,
      rrmSim,
      guardrails,
    },
    shadow,
    admin: {
      decisionTrace,
      missingSources,
      notes: [],
    },
  };
}
