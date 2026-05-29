/**
 * P7.6-r6a: End-to-end funnel shadow audit types (pure; no Prisma).
 */

export const END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION =
  "p7.6-end-to-end-funnel-shadow-audit-v1" as const;

export const END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION =
  "p7.6-r6a-end-to-end-funnel-shadow-audit-v1" as const;

export type P76EndToEndSourcePoolType = "onboarding_gated_cohort";

export type P76DifferenceStage =
  | "no_change"
  | "photo_pool"
  | "twenty_d_ranking"
  | "rrm_selector"
  | "legacy_mismatch"
  | "unknown";

export type P76Stage1PhotoVisualCandidateSummaryV1 = {
  candidateUserId: string;
  mutualPhotoVisualFit: number | null;
  AtoBPhotoVisualFit?: number | null;
  BtoAPhotoVisualFit?: number | null;
  rank: number;
};

export type P76Stage1PhotoVisualSummaryV1 = {
  sourceVersion: string;
  selectedCandidateIds: string[];
  topCandidatesSummary: P76Stage1PhotoVisualCandidateSummaryV1[];
};

export type P76Stage2TwentyDCandidateSummaryV1 = {
  candidateUserId: string;
  mutual20DFit: number | null;
  AtoB20DFit?: number | null;
  BtoA20DFit?: number | null;
  rank: number;
};

export type P76Stage2TwentyDSummaryV1 = {
  sourceVersion: string;
  top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId: string | null;
  rankedCandidatesSummary: P76Stage2TwentyDCandidateSummaryV1[];
};

export type P76Stage3RrmCandidateSummaryV1 = {
  candidateUserId: string;
  mutualRrmFit: number | null;
  AtoBRrmFit?: number | null;
  BtoARrmFit?: number | null;
  riskFlagCount?: number;
  rank: number;
};

export type P76Stage3RrmSummaryV1 = {
  sourceVersion: string;
  selectedByRrmCandidateId: string | null;
  rankedCandidatesSummary: P76Stage3RrmCandidateSummaryV1[];
  reasonSummary: string;
};

/** Legacy fields injected by r6b adapter; optional for r6a pure tests. */
export type P76LegacyComparisonInputV1 = {
  matchResultId?: string | null;
  matchResultCandidateUserId?: string | null;
  matchResultFinalScore?: number | null;
  displayCandidateUserId?: string | null;
  displaySourceType?: string | null;
  legacyPreviewPoolCandidateIds?: string[];
  workerWinnerCandidateUserId?: string | null;
  m6RrmTop2CandidateIds?: string[];
  m6RrmSelectedCandidateId?: string | null;
};

export type P76LegacyComparisonV1 = {
  matchResultId?: string | null;
  matchResultCandidateUserId: string | null;
  matchResultFinalScore: number | null;
  displayCandidateUserId: string | null;
  displaySourceType: string | null;
  legacyPreviewPoolCandidateIds: string[];
  workerWinnerCandidateUserId: string | null;
  m6RrmTop2CandidateIds: string[];
  m6RrmSelectedCandidateId: string | null;
  wouldChangeLegacyMatchResult: boolean;
  wouldChangeDisplayCandidate: boolean;
  wouldChangeWorkerWinner: boolean;
  wouldChangeM6Top2: boolean;
  differenceStage: P76DifferenceStage;
  comparisonReasonSummary: string;
};

export type P76FinalShadowV1 = {
  selectedCandidateId: string | null;
  applied: false;
  appliedToPool: false;
  appliedToFinalScore: false;
  appliedToMatchResult: false;
  appliedToWorkerRanking: false;
  appliedToDisplay: false;
};

export type P76EndToEndFunnelInputV1 = {
  viewerUserId: string;
  sourcePoolType: P76EndToEndSourcePoolType;
  generatedAt: string;
  stage1PhotoVisual: P76Stage1PhotoVisualSummaryV1;
  stage2TwentyD: P76Stage2TwentyDSummaryV1;
  stage3Rrm: P76Stage3RrmSummaryV1;
  legacy?: P76LegacyComparisonInputV1;
};

export type P76EndToEndFunnelShadowAuditV1 = {
  schemaVersion: typeof END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION;
  sourceVersion: typeof END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION;
  viewerUserId: string;
  sourcePoolType: P76EndToEndSourcePoolType;
  generatedAt: string;
  stage1PhotoVisual: P76Stage1PhotoVisualSummaryV1 & {
    selectedCount: number;
  };
  stage2TwentyD: P76Stage2TwentyDSummaryV1;
  stage3Rrm: P76Stage3RrmSummaryV1 & {
    wouldChange20DWinner: boolean;
  };
  legacyComparison: P76LegacyComparisonV1;
  finalShadow: P76FinalShadowV1;
};

export type P76DifferenceStageInputV1 = {
  finalSelectedCandidateId: string | null;
  wouldChange20DWinner: boolean;
  wouldChangeLegacyMatchResult: boolean;
  wouldChangeWorkerWinner: boolean;
  wouldChangeDisplayCandidate: boolean;
  stage1SelectedCandidateIds: string[];
  legacyPreviewPoolCandidateIds: string[];
  stage2Top2CandidateIds: string[];
  workerWinnerCandidateUserId: string | null;
  hasLegacyContext: boolean;
};
