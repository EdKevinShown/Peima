export type TestingTimelineStatus =
  | "success"
  | "pending"
  | "failed"
  | "unavailable";

export type TestingTimelineItem = {
  key: string;
  label: string;
  status: TestingTimelineStatus;
  createdAt: string | null;
  updatedAt: string | null;
  sourceVersion: string | null;
  fallbackUsed: boolean | null;
  errorCode: string | null;
};

export type TestingUserListItem = {
  userId: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  onboardingStatus: string;
  hasPhotoUpload: boolean;
  hasPhotoPreference: boolean;
  hasPreviewPool: boolean;
  hasQuestionnaireProfile: boolean;
  hasMatchResult: boolean;
  latestMatchResultId: string | null;
  latestDisplaySourceType: string | null;
  latestFallbackUsed: boolean | null;
  latestErrorCode: string | null;
};

export type TestingOnboardingSummary = {
  uploadStatus: string;
  preferenceStatus: string;
  previewPoolStatus: string;
  expectedPoolRule: "3-2-1";
  poolCounts: {
    aestheticMatchCount: number;
    similarStyleCount: number;
    explorationCount: number;
    totalCount: number;
    expectedAestheticMatchCount: 3;
    expectedSimilarStyleCount: 2;
    expectedExplorationCount: 1;
    isThreeTwoOneValid: boolean;
  } | null;
  duplicateCandidateIds: string[];
  selfMatchDetected: boolean;
  frozenOrRegenerateState: string | null;
  sourceVersion: string | null;
  fallbackUsed: boolean | null;
  safeCandidateUserIds: string[];
};

export type TestingQuestionnaireSummary = {
  answeredCount: number;
  requiredCount: number;
  convergenceStatus:
    | "converged"
    | "not_converged"
    | "insufficient_data"
    | "unknown";
  profileDimensionCompleteness: number;
  missingDimensions: string[];
  sourceVersion: string | null;
  updatedAt: string | null;
  safeProfileSummary: {
    confidence: number | null;
    filledAxisCount: number;
    totalAxisCount: number;
  } | null;
};

export type TestingMatchDebugSummary = {
  matchResultId: string;
  viewerUserId: string;
  candidateUserId: string;
  displayCandidateUserId: string;
  displaySourceType: string;
  finalScore: number | null;
  finalMatchDecisionMetaPresent: boolean;
  matchInsightsPresent: boolean;
  scoreShadowV2Present: boolean;
  rrmDecisionShadowPresent: boolean;
  pairwiseAvailable: boolean;
  fallbackUsed: boolean | null;
  guardrailFlags: string[];
  sourceVersion: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TestingEventRow = {
  id: string;
  userId: string | null;
  matchResultId: string | null;
  eventType: string;
  status: string;
  source: string | null;
  sourceVersion: string | null;
  fallbackUsed: boolean | null;
  errorCode: string | null;
  message: string | null;
  createdAt: string;
};

export type TestingFeedbackRow = {
  id: string;
  userId: string;
  matchResultId: string | null;
  rating: string;
  reasonCodes: string[];
  freeText: string | null;
  source: string | null;
  createdAt: string;
};

export type RecordTestingEventInput = {
  userId?: string | null;
  matchResultId?: string | null;
  eventType: string;
  status: string;
  source?: string | null;
  sourceVersion?: string | null;
  fallbackUsed?: boolean | null;
  errorCode?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};
