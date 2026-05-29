/**
 * P7.6-r4a: 20D Bidirectional Ranking shadow types (pure input/output; no Prisma).
 */

export const TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION =
  "p7.6-20d-bidirectional-ranking-shadow-v1" as const;

export const TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION =
  "p7.6-r4a-20d-bidirectional-ranking-shadow-v1" as const;

/** r4a: only onboarding_gated_cohort (aligned with Stage 1). */
export type TwentyDPoolSourceType = "onboarding_gated_cohort";

export const TWENTY_D_FALLBACK_REASONS = [
  "VIEWER_PROFILE_MISSING",
  "CANDIDATE_PROFILE_MISSING",
  "PREFERENCE_MISSING",
  "SCORE_INPUT_INVALID",
  "SCORE_CALCULATION_FAILED",
] as const;

export type TwentyDFallbackReason = (typeof TWENTY_D_FALLBACK_REASONS)[number];

export type TwentyDScoreBreakdownV1 = {
  AtoBProfile?: number;
  AtoBPreference?: number;
  BtoAProfile?: number;
  BtoAPreference?: number;
};

/** Normalized directional scores (r4b DB adapter fills from computeProfileScore / computePreferenceScore). */
export type TwentyDCandidateInputV1 = {
  candidateUserId: string;
  profileScoreAtoB: number | null;
  preferenceScoreAtoB: number | null;
  profileScoreBtoA: number | null;
  preferenceScoreBtoA: number | null;
};

export type TwentyDStage1ContextV1 = {
  sourceVersion: string;
  selectedCandidateIds: string[];
  poolId?: string;
};

export type TwentyDBidirectionalRankingInputV1 = {
  viewerUserId: string;
  sourcePoolType: TwentyDPoolSourceType;
  generatedAt: string;
  stage1: TwentyDStage1ContextV1;
  /** When false, stage2 top2=[] and stage-level VIEWER_PROFILE_MISSING. */
  viewerProfilePresent: boolean;
  candidates: TwentyDCandidateInputV1[];
  topN?: number;
  top2?: number;
};

export type TwentyDRankedCandidateV1 = {
  candidateUserId: string;
  rank: number;
  AtoB20DFit: number | null;
  BtoA20DFit: number | null;
  mutual20DFit: number | null;
  imbalancePenalty: number | null;
  breakdown?: TwentyDScoreBreakdownV1;
  reasons: string[];
  missingSignals: string[];
  fallbackReason: TwentyDFallbackReason | null;
  eligible: boolean;
  ineligibleReasons: TwentyDFallbackReason[];
};

export type TwentyDCandidateRankedResultV1 = {
  candidateUserId: string;
  AtoB20DFit: number;
  BtoA20DFit: number;
  mutual20DFit: number;
};

export type Stage2TwentyDPoolV1 = {
  rankedCandidates: TwentyDRankedCandidateV1[];
  topNCandidateIds: string[];
  top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId: string | null;
  appliedToFinalScore: false;
};

export type TwentyDPoolComparisonsV1 = {
  workerFinalScoreWinnerCandidateId?: string | null;
  scoreShadowV2Top2CandidateIds?: string[];
  wouldChangeVsWorkerWinner?: boolean;
  reason?: string;
};

export type TwentyDFinalShadowV1 = {
  stage2Top2CandidateIds: string[];
  applied: false;
  appliedToPool: false;
  appliedToFinalScore: false;
  appliedToMatchResult: false;
  appliedToWorkerRanking: false;
};

export type TwentyDBidirectionalRankingShadowV1 = {
  schemaVersion: typeof TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION;
  sourceVersion: typeof TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION;
  viewerUserId: string;
  sourcePoolType: TwentyDPoolSourceType;
  generatedAt: string;
  stage1: TwentyDStage1ContextV1;
  stage2TwentyD: Stage2TwentyDPoolV1;
  comparisons: TwentyDPoolComparisonsV1;
  finalShadow: TwentyDFinalShadowV1;
};

export type TwentyDDirectionalFitInputV1 = {
  profileScore: number | null;
  preferenceScore: number | null;
};
