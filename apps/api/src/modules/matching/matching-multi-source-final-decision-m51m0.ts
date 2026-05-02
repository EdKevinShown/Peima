import type { MatchResult } from "@peima/database";
import type {
  MatchResultDisplayFields,
  MatchResultDisplaySourceType,
  ViewerSafeFinalMatchDecisionMeta,
} from "./matching-result-display";

/** M5.1-M0/M1 — readonly sidecar; does not participate in display resolution. */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION = 1 as const;

/** Bumped M5.1-M1: adds `baseline` / `sources` / `admin` hydration (still readonly). */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION =
  "m5.1-m1-multi-source-final-decision-readonly-v1" as const;

export type MultiSourceDecisionTraceEntryReadonly = {
  step: "source_hydration_readonly";
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

export type MultiSourceRrmSimSourceReadonly = {
  available: false;
  summary: string;
  unavailableReason: "m51m1_no_rrm_sim_hydration";
};

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
  /** M5.1+ may propose a display id; M5.1-M1 always null. */
  m5ProposedDisplayCandidateUserId: null;
  /** M5.1-M1 never applies M5 synthesis to display. */
  m5AppliedToDisplay: false;
  wouldChangeCurrentDisplay: false;
  decisionRule: "current_display_preserved_readonly";
  sources: MultiSourceFinalDecisionSourcesReadonly;
  admin: MultiSourceFinalDecisionAdminReadonly;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
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
}): string[] {
  const out: string[] = ["rrm_sim"];
  if (!input.pairwiseAvailable) {
    out.push("pairwise_finalize_meta");
  }
  if (input.guardrailStatus === "not_evaluated") {
    out.push("guardrails_explicit_signal");
  }
  return out;
}

/**
 * M5.1-M0/M1: readonly multi-source sidecar — echoes current display + viewer-safe source hydration.
 * Must not alter `displayCandidateUserId` / `displaySourceType` resolution.
 */
export function buildMultiSourceFinalDecisionReadonlyM51M0(
  matchRow: MatchResult,
  display: MatchResultDisplayFields,
): MultiSourceFinalDecisionReadonlyM51M0 {
  const meta = display.finalMatchDecisionMeta;
  const pairwise = buildPairwiseSourceReadonly(meta);
  const guardrails = buildGuardrailsReadonly(meta, matchRow);
  const missingSources = buildMissingSourcesReadonly({
    pairwiseAvailable: pairwise.available === true,
    guardrailStatus: guardrails.status,
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
      rrmSim: {
        available: false,
        summary: "not_hydrated_in_m51m1",
        unavailableReason: "m51m1_no_rrm_sim_hydration",
      },
      guardrails,
    },
    admin: {
      decisionTrace: [
        {
          step: "source_hydration_readonly",
          detail: "m51m1_viewer_safe_fields_only",
        },
      ],
      missingSources,
      notes: [],
    },
  };
}
