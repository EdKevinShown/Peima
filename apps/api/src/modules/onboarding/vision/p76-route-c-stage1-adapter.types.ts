/**
 * P7.6-r7g2 / r7g3: Route C clean pool Stage1 adapter contract (read-only audit).
 */

export const P76_ROUTE_C_STAGE1_ADAPTER_SCHEMA_VERSION =
  "p7.6-r7g2-route-c-stage1-adapter-v1" as const;

export const P76_ROUTE_C_SOURCE_POOL_TYPE = "route_c_clean_pool" as const;

export const P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION =
  "p7.6-r7j3-staging-cohort-v1" as const;

export type RouteCStage1SourcePoolType = typeof P76_ROUTE_C_SOURCE_POOL_TYPE;

export type RouteCStage1IneligibleReason =
  | "SELF"
  | "VISION_NOT_OK"
  | "EMPTY_PHOTO_VISUAL_TAGS"
  | "REVIEW_BLOCKED"
  | "DETECTION_UNAVAILABLE"
  | "PROFILE_MISSING"
  | "PREFERENCE_MISSING";

export type RouteCStage1CandidatePairV1 = {
  candidateUserId: string;
  rankInPool: number;
  eligible: boolean;
  ineligibleReasons: RouteCStage1IneligibleReason[];
  hasVision: boolean;
  photoVisualTagsCount: number;
  hasTwentyDProfile: boolean;
  nonNull20DCount: number;
  hasPreference: boolean;
};

export type RouteCStage1AdapterReportV1 = {
  schemaVersion: typeof P76_ROUTE_C_STAGE1_ADAPTER_SCHEMA_VERSION;
  generatedAt: string;
  viewerUserId: string;
  sourcePoolType: RouteCStage1SourcePoolType;
  sourcePoolId: string | null;
  poolSourceVersion: string;
  selectionLimit: number;
  dryRun: true;
  scannedCandidates: number;
  eligibleCandidates: number;
  selectedCandidateIds: string[];
  ineligibleReasonDistribution: Record<string, number>;
  pairs: RouteCStage1CandidatePairV1[];
  applied: false;
};

export type RouteCStage1AdapterCliInput = {
  viewerUserId: string;
  sourcePoolType: RouteCStage1SourcePoolType;
  poolSourceVersion: string;
  selectionLimit: number;
  dryRun: true;
};
