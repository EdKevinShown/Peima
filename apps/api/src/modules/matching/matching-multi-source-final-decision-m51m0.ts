import type { MatchResult } from "@peima/database";
import type {
  MatchResultDisplayFields,
  MatchResultDisplaySourceType,
  ViewerSafeFinalMatchDecisionMeta,
} from "./matching-result-display";

/** M5.1-M0/M1/M2 — readonly sidecar; does not participate in display resolution. */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION = 1 as const;

/** Bumped M5.1-M2: RRM-Sim discovery + optional hydration from embedded viewer-safe summary only. */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION =
  "m5.1-m2-multi-source-final-decision-readonly-v1" as const;

/**
 * Optional future / backfill envelope on `MatchResult.matchInsights` (never written by M5.1-M2).
 * Only `sourceVersion` in this allow-list is accepted as viewer-safe RRM-Sim echo.
 */
export const RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY = "rrmSimReadonlySummary" as const;

const ALLOWED_RRM_SIM_READONLY_SOURCE_VERSIONS = new Set<string>([
  "rrm-sim-v1",
  "m4.0-readonly-rrm-ranking-proposal-v1",
]);

export type MultiSourceDecisionTraceStepReadonly =
  | "source_hydration_readonly"
  | "rrm_sim_source_discovery_readonly";

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
  status: "not_evaluated" | "caution";
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

export type MultiSourceFinalDecisionReadonlyM51M0 = {
  schemaVersion: typeof MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION;
  sourceVersion: typeof MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION;
  baseline: MultiSourceBaselineReadonly;
  /** Mirrors resolved `displayCandidateUserId` after existing finalize logic. */
  currentDisplayCandidateUserId: string;
  /** Mirrors resolved `displaySourceType`. */
  currentDisplaySourceType: MatchResultDisplaySourceType;
  /** M5.1+ may propose a display id; M5.1-M2 always null. */
  m5ProposedDisplayCandidateUserId: null;
  /** M5.1-M2 never applies M5 synthesis to display. */
  m5AppliedToDisplay: false;
  wouldChangeCurrentDisplay: false;
  decisionRule: "current_display_preserved_readonly";
  sources: MultiSourceFinalDecisionSourcesReadonly;
  admin: MultiSourceFinalDecisionAdminReadonly;
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
  if (!sourceVersion || !ALLOWED_RRM_SIM_READONLY_SOURCE_VERSIONS.has(sourceVersion)) {
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

/** Read-only: `matchInsights.explanation.cautions` + `matchInsights.riskFlags` only. */
function readMatchInsightsCautionSignals(matchInsights: unknown): {
  cautions: string[];
  riskFlags: string[];
} {
  if (!isRecord(matchInsights)) {
    return { cautions: [], riskFlags: [] };
  }
  const cautions: string[] = [];
  const riskFlags: string[] = [];
  const exp = matchInsights.explanation;
  if (isRecord(exp) && Array.isArray(exp.cautions)) {
    for (const x of exp.cautions) {
      if (typeof x === "string" && x.trim()) cautions.push(x.trim());
    }
  }
  if (Array.isArray(matchInsights.riskFlags)) {
    for (const x of matchInsights.riskFlags) {
      if (typeof x === "string" && x.trim()) riskFlags.push(x.trim());
    }
  }
  return { cautions, riskFlags };
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

function buildGuardrailsReadonly(
  meta: ViewerSafeFinalMatchDecisionMeta | null,
  matchRow: MatchResult,
): MultiSourceGuardrailsSourceReadonly {
  const { cautions, riskFlags } = readMatchInsightsCautionSignals(matchRow.matchInsights);
  const cautionReasons: string[] = [];
  for (const c of cautions.slice(0, 8)) {
    cautionReasons.push(c.length > 200 ? `${c.slice(0, 200)}…` : c);
  }
  for (const r of riskFlags.slice(0, 8)) {
    cautionReasons.push(r.length > 200 ? `${r.slice(0, 200)}…` : r);
  }
  const fr = meta?.fallbackReason;
  if (typeof fr === "string" && fr.trim()) {
    cautionReasons.push(`finalize_fallback:${fr.trim().slice(0, 120)}`);
  }

  if (cautionReasons.length === 0) {
    return {
      status: "not_evaluated",
      blockReasons: [],
      cautionReasons: [],
      sourceSummary: "no_viewer_safe_caution_signals",
    };
  }
  return {
    status: "caution",
    blockReasons: [],
    cautionReasons,
    sourceSummary: "match_insights_or_finalize_fallback_only",
  };
}

function buildMissingSourcesReadonly(input: {
  pairwiseAvailable: boolean;
  guardrailStatus: "not_evaluated" | "caution";
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

/**
 * M5.1-M0/M1/M2: readonly multi-source sidecar — echoes current display + viewer-safe source hydration.
 * Must not alter `displayCandidateUserId` / `displaySourceType` resolution.
 */
export function buildMultiSourceFinalDecisionReadonlyM51M0(
  matchRow: MatchResult,
  display: MatchResultDisplayFields,
): MultiSourceFinalDecisionReadonlyM51M0 {
  const meta = display.finalMatchDecisionMeta;
  const pairwise = buildPairwiseSourceReadonly(meta);
  const guardrails = buildGuardrailsReadonly(meta, matchRow);
  const { rrmSim, discoveryDetail } = discoverRrmSimReadonly(matchRow);
  const missingSources = buildMissingSourcesReadonly({
    pairwiseAvailable: pairwise.available === true,
    guardrailStatus: guardrails.status,
    rrmSimAvailable: rrmSim.available === true,
  });

  return {
    schemaVersion: MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION,
    sourceVersion: MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION,
    baseline: {
      matchResultCandidateUserId: matchRow.candidateUserId,
      finalScore: matchRow.finalScore,
      sourceType: "match_result_baseline",
    },
    currentDisplayCandidateUserId: display.displayCandidateUserId,
    currentDisplaySourceType: display.displaySourceType,
    m5ProposedDisplayCandidateUserId: null,
    m5AppliedToDisplay: false,
    wouldChangeCurrentDisplay: false,
    decisionRule: "current_display_preserved_readonly",
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
    admin: {
      decisionTrace: [
        {
          step: "source_hydration_readonly",
          detail: "m51m1_viewer_safe_fields_only",
        },
        {
          step: "rrm_sim_source_discovery_readonly",
          detail: discoveryDetail,
        },
      ],
      missingSources,
      notes: [],
    },
  };
}
