/**
 * P7.6-r5a: RRM Top2 Final Selector shadow types (pure input/output; no Prisma).
 */

export const RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION =
  "p7.6-rrm-top2-final-selector-shadow-v1" as const;

export const RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION =
  "p7.6-r5a-rrm-top2-final-selector-shadow-v1" as const;

/** r5a: only onboarding_gated_cohort (aligned with Stage 1/2). */
export type RrmPoolSourceType = "onboarding_gated_cohort";

export const RRM_FALLBACK_REASONS = [
  "TOP2_NOT_AVAILABLE",
  "VIEWER_RRM_PROFILE_MISSING",
  "CANDIDATE_RRM_PROFILE_MISSING",
  "RRM_INPUT_INVALID",
  "RRM_SCORE_CALCULATION_FAILED",
  "RRM_INSUFFICIENT_SIGNAL",
] as const;

export type RrmFallbackReason = (typeof RRM_FALLBACK_REASONS)[number];

export type RrmRiskFlag = string;

export type RrmRepairPotentialSignal = string;

/**
 * Normalized rhythm scores (0–1); r5b DB adapter fills from relationship profile.
 */
export type RrmTop2CandidateInputV1 = {
  candidateUserId: string;
  rhythmScoreAtoB: number | null;
  rhythmScoreBtoA: number | null;
  rhythmRiskFlags?: RrmRiskFlag[];
  pressureRiskFlags?: RrmRiskFlag[];
  boundaryRiskFlags?: RrmRiskFlag[];
  repairPotentialSignals?: RrmRepairPotentialSignal[];
  /** Optional explicit tie-break score; defaults from repairPotentialSignals count. */
  repairPotentialScore?: number | null;
};

export type RrmStage1ContextV1 = {
  sourceVersion: string;
  selectedCandidateIds: string[];
  poolId?: string;
};

export type RrmStage2TwentyDContextV1 = {
  sourceVersion: string;
  top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId: string | null;
};

export type RrmTop2FinalSelectorInputV1 = {
  viewerUserId: string;
  sourcePoolType: RrmPoolSourceType;
  generatedAt: string;
  stage1: RrmStage1ContextV1;
  stage2TwentyD: RrmStage2TwentyDContextV1;
  /** When false, fallback to selectedBy20DOnlyCandidateId. */
  viewerRrmProfilePresent: boolean;
  /** One row per Top2 candidate (subset of stage2TwentyD.top2CandidateIds). */
  candidates: RrmTop2CandidateInputV1[];
};

export type RrmTop2RankedCandidateV1 = {
  candidateUserId: string;
  rank: number;
  AtoBRrmFit: number | null;
  BtoARrmFit: number | null;
  mutualRrmFit: number | null;
  rhythmRiskFlags: RrmRiskFlag[];
  pressureRiskFlags: RrmRiskFlag[];
  boundaryRiskFlags: RrmRiskFlag[];
  repairPotentialSignals: RrmRepairPotentialSignal[];
  repairPotentialScore: number;
  riskFlagCount: number;
  missingSignals: string[];
  fallbackReason: RrmFallbackReason | null;
  eligible: boolean;
  ineligibleReasons: RrmFallbackReason[];
};

export type RrmCandidateSortRowV1 = {
  candidateUserId: string;
  AtoBRrmFit: number;
  BtoARrmFit: number;
  mutualRrmFit: number;
  riskFlagCount: number;
  repairPotentialScore: number;
};

export type Stage3RrmTop2PoolV1 = {
  evaluatedCandidateIds: string[];
  rankedCandidates: RrmTop2RankedCandidateV1[];
  selectedByRrmCandidateId: string | null;
  wouldChange20DWinner: boolean;
  reasonSummary: string;
  appliedToMatchResult: false;
};

export type RrmPoolComparisonsV1 = {
  workerFinalScoreWinnerCandidateId?: string | null;
  m6RrmV2Top2CandidateIds?: string[];
  wouldChangeVsM6Top2?: boolean;
  reason?: string;
};

export type RrmFinalShadowV1 = {
  stage3SelectedCandidateId: string | null;
  applied: false;
  appliedToPool: false;
  appliedToFinalScore: false;
  appliedToMatchResult: false;
  appliedToWorkerRanking: false;
};

export type RrmTop2FinalSelectorShadowV1 = {
  schemaVersion: typeof RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION;
  sourceVersion: typeof RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION;
  viewerUserId: string;
  sourcePoolType: RrmPoolSourceType;
  generatedAt: string;
  stage1: RrmStage1ContextV1;
  stage2TwentyD: RrmStage2TwentyDContextV1;
  stage3Rrm: Stage3RrmTop2PoolV1;
  comparisons: RrmPoolComparisonsV1;
  finalShadow: RrmFinalShadowV1;
};

export type RrmDirectionalRhythmInputV1 = {
  rhythmScore: number | null;
};
