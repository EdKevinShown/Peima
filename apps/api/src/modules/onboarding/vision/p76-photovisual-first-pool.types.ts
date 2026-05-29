/**
 * P7.6-r3a: PhotoVisual First Pool shadow types (pure input/output; no Prisma).
 */

export const PHOTO_FIRST_MUTUAL_MATCHING_SCHEMA_VERSION =
  "p7.6-photo-first-mutual-matching-shadow-v1" as const;

export const PHOTO_FIRST_MUTUAL_MATCHING_SOURCE_VERSION =
  "p7.6-r3-photovisual-first-pool-shadow-v1" as const;

/** r3a: only onboarding_gated_cohort is implemented in the builder. */
export type PhotoVisualPoolSourceType = "onboarding_gated_cohort";

export const PHOTO_VISUAL_INELIGIBLE_REASONS = [
  "SELF",
  "GENDER_GATE",
  "PREFERENCE_GATE",
  "REVIEW_BLOCKED",
  "DETECTION_UNAVAILABLE",
  "VISION_NOT_OK",
  "EMPTY_PHOTO_VISUAL_TAGS",
  "VIEWER_VISION_MISSING",
  "USER_BLOCKED",
  "MISSING_PROFILE",
  "MISSING_STYLE_TAGS",
] as const;

export type PhotoVisualIneligibleReason =
  (typeof PHOTO_VISUAL_INELIGIBLE_REASONS)[number];

export type UsableVisionInput = {
  provider?: string;
  sourceVersion?: string;
  visionStatus?: string;
  photoVisualTags: string[];
  qualityTags?: string[];
  sceneTags?: string[];
  confidence?: number;
};

export type PhotoVisualCandidateGatesV1 = {
  isSelf: boolean;
  genderGatePassed: boolean;
  preferenceGatePassed: boolean;
  reviewUsable: boolean;
  detectionUsable: boolean;
  userBlocked: boolean;
  missingProfile: boolean;
};

export type PhotoVisualCandidateInput = {
  candidateUserId: string;
  candidateStyleTags: string[];
  candidateVision: UsableVisionInput | null;
  gates: PhotoVisualCandidateGatesV1;
};

export type PhotoVisualPoolInputV1 = {
  viewerUserId: string;
  viewerStyleTags: string[];
  viewerVision: UsableVisionInput | null;
  candidates: PhotoVisualCandidateInput[];
  sourcePoolType: PhotoVisualPoolSourceType;
  poolId: string;
  generatedAt: string;
  selectionLimit?: number;
};

export type PhotoVisualPairQualitySignalsV1 = {
  viewerQualityTags?: string[];
  candidateQualityTags?: string[];
};

export type PhotoVisualPairSceneSignalsV1 = {
  viewerSceneTags?: string[];
  candidateSceneTags?: string[];
};

export type PhotoVisualPairV1 = {
  candidateUserId: string;
  eligible: boolean;
  ineligibleReasons: PhotoVisualIneligibleReason[];
  AtoBPhotoVisualFit: number | null;
  BtoAPhotoVisualFit: number | null;
  mutualPhotoVisualFit: number | null;
  visualImbalancePenalty: number | null;
  usedViewerStyleTags: string[];
  usedCandidateStyleTags: string[];
  usedViewerPhotoVisualTags: string[];
  usedCandidatePhotoVisualTags: string[];
  viewerVisionSourceVersion?: string;
  candidateVisionSourceVersion?: string;
  viewerVisionProvider?: string;
  candidateVisionProvider?: string;
  qualitySignals?: PhotoVisualPairQualitySignalsV1;
  sceneSignals?: PhotoVisualPairSceneSignalsV1;
  fallbackReason?: string;
};

export type Stage1PhotoVisualPoolV1 = {
  eligibleCandidatesCount: number;
  ineligibleCandidatesCount: number;
  selectedCandidateIds: string[];
  pairs: PhotoVisualPairV1[];
  appliedToPool: false;
};

export type PhotoVisualPoolComparisonsV1 = {
  onboardingV1CandidateIds?: string[];
  legacyPreviewPoolCandidateIds?: string[];
  visualRankingShadowCandidateIds?: string[];
  wouldChangeOnboardingV1?: boolean;
  wouldChangeLegacyPreviewPool?: boolean;
  overlapCountWithVisualRankingShadow?: number;
  jaccardSelectedVsShadow?: number;
  reason?: string;
};

export type PhotoVisualFinalShadowV1 = {
  stage1SelectedCandidateIds: string[];
  applied: false;
  appliedToPool: false;
  appliedToFinalScore: false;
  appliedToMatchResult: false;
  appliedToWorkerRanking: false;
};

export type PhotoFirstMutualMatchingShadowV1 = {
  schemaVersion: typeof PHOTO_FIRST_MUTUAL_MATCHING_SCHEMA_VERSION;
  sourceVersion: typeof PHOTO_FIRST_MUTUAL_MATCHING_SOURCE_VERSION;
  viewerUserId: string;
  poolId: string;
  sourcePoolType: PhotoVisualPoolSourceType;
  generatedAt: string;
  stage1PhotoVisualPool: Stage1PhotoVisualPoolV1;
  comparisons: PhotoVisualPoolComparisonsV1;
  finalShadow: PhotoVisualFinalShadowV1;
};

export type PhotoVisualScoredPairV1 = {
  candidateUserId: string;
  AtoBPhotoVisualFit: number;
  BtoAPhotoVisualFit: number;
  mutualPhotoVisualFit: number;
};

export type PhotoVisualPairEligibilityInput = {
  viewerUserId: string;
  viewerStyleTags: string[];
  viewerVision: UsableVisionInput | null;
  candidateUserId: string;
  candidateStyleTags: string[];
  candidateVision: UsableVisionInput | null;
  gates: PhotoVisualCandidateGatesV1;
};

export type PhotoVisualPairEligibilityResult = {
  eligible: boolean;
  ineligibleReasons: PhotoVisualIneligibleReason[];
};
