/** M4.1 — read-only four-source decision comparison (JWT matching). */
export const M4_1_DECISION_COMPARISON_SOURCE_VERSION =
  "m4.1-three-source-decision-comparison-readonly-v1" as const;

export const M4_1_DECISION_COMPARISON_NOTE = {
  STATIC_SHORTLIST_MISSING: "STATIC_SHORTLIST_MISSING",
  MATCH_RESULT_MISSING: "MATCH_RESULT_MISSING",
  PAIRWISE_META_MISSING: "PAIRWISE_META_MISSING",
  RRM_PROPOSAL_MISSING: "RRM_PROPOSAL_MISSING",
} as const;

export type StaticShortlistComparisonDto = {
  source: "preview_pool_shortlist_contract_v0";
  top1CandidateUserId: string | null;
  top2CandidateUserId: string | null;
  shortlistSize: number;
};

export type MatchResultOriginalComparisonDto = {
  matchResultId: string;
  candidateUserId: string;
  finalScore: number | null;
  createdAt: string;
};

export type PairwiseFrozenComparisonDto =
  | {
      present: true;
      selectedCandidateUserId: string;
      staticTop1CandidateUserId: string;
      pairwiseWinnerCandidateUserId: string | null;
      sourceType: string;
      mode: string;
      frozen: true;
      wouldChangeStaticResult: boolean;
      fallbackReason: string | null;
      appliedToFinalScore: false;
      appliedToWorkerRanking: false;
    }
  | { present: false };

export type RrmReadonlyComparisonDto =
  | {
      present: true;
      simulationJobId: string;
      rrmTop1CandidateUserId: string | null;
      wouldChangeStaticResult: boolean;
      appliedToMatchResult: false;
      appliedToFinalScore: false;
      appliedToDisplayCandidate: false;
    }
  | {
      present: false;
      code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL";
    };

export type DecisionComparisonSummaryDto = {
  allSelectedIds: string[];
  uniqueCandidateCount: number;
  staticTop1EqualsMatchResultOriginal: boolean | null;
  staticTop1EqualsPairwiseSelected: boolean | null;
  staticTop1EqualsRrmTop1: boolean | null;
  matchResultOriginalEqualsPairwiseSelected: boolean | null;
  matchResultOriginalEqualsRrmTop1: boolean | null;
  pairwiseSelectedEqualsRrmTop1: boolean | null;
  notes: string[];
};

export type MatchingDecisionComparisonHttpDto = {
  schemaVersion: 1;
  sourceVersion: typeof M4_1_DECISION_COMPARISON_SOURCE_VERSION;
  mode: "readonly";
  viewerUserId: string;
  poolId: string;
  staticShortlist: StaticShortlistComparisonDto | null;
  matchResultOriginal: MatchResultOriginalComparisonDto | null;
  pairwiseFrozen: PairwiseFrozenComparisonDto;
  rrmReadonly: RrmReadonlyComparisonDto;
  comparisonSummary: DecisionComparisonSummaryDto;
};
