/**
 * P7.6-r8g1 — admin read API contracts for allowlist apply sidecar.
 */

import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "./p76-allowlist-apply-meta.types";

export const P76_ADMIN_LIST_SCHEMA_VERSION =
  "p7.6-r8g1-admin-allowlist-apply-meta-list-v1" as const;

export const P76_ADMIN_DETAIL_SCHEMA_VERSION =
  "p7.6-r8g1-admin-allowlist-apply-meta-detail-v1" as const;

export const P76_ADMIN_AGGREGATE_SCHEMA_VERSION =
  "p7.6-r8g1-admin-allowlist-apply-meta-aggregate-v1" as const;

export const P76_ADMIN_DEFAULT_LIST_LIMIT = 50;
export const P76_ADMIN_MAX_LIST_LIMIT = 100;

export const P76_ADMIN_CURRENT_COHORT_SOURCE_VERSION =
  P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION;

export type P76AdminSidecarStatus = "dry_run" | "written" | "rolled_back";

export type P76AdminProductApplyStatus =
  | "not_applied"
  | "blocked"
  | "future_enabled";

export type P76AdminMainChainApplyStatus = "none" | "violation_detected";

export type P76AdminViolationStatus =
  | "ok"
  | "p0_main_chain_flag"
  | "rolled_back"
  | "artifact_missing"
  | "stale_source_version";

export type P76AllowlistApplyMetaDbRow = {
  id: string;
  viewerUserId: string;
  selectedCandidateId: string;
  sourcePipeline: string;
  schemaVersion: string;
  sourceVersion: string;
  routeCArtifactPath: string | null;
  stage1SelectedCandidateIds: unknown;
  stage2Top2CandidateIds: unknown;
  selectedBy20DOnlyCandidateId: string | null;
  selectedByRrmCandidateId: string | null;
  finalShadowSelectedCandidateId: string;
  allowlistMatched: boolean;
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  applied: boolean;
  appliedToPool: boolean;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToDisplay: boolean;
  appliedToWorkerRanking: boolean;
  dryRun: boolean;
  appliedAt: Date | null;
  appliedBy: string | null;
  rolledBack: boolean;
  rolledBackAt: Date | null;
  rolledBackBy: string | null;
  rollbackReason: string | null;
  rollbackToken: string | null;
  auditNotes: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type P76AdminAllowlistApplyMetaDerivedV1 = {
  sidecarStatus: P76AdminSidecarStatus;
  productApplyStatus: P76AdminProductApplyStatus;
  mainChainApplyStatus: P76AdminMainChainApplyStatus;
  violationStatus: P76AdminViolationStatus;
};

export type P76AdminAllowlistApplyMetaRowV1 = P76AllowlistApplyMetaDbRow &
  P76AdminAllowlistApplyMetaDerivedV1;

export type P76AdminStageSummaryV1 = {
  stage1Count: number;
  stage2Count: number;
  selectedBy20DOnlyCandidateId: string | null;
  selectedByRrmCandidateId: string | null;
  finalShadowSelectedCandidateId: string;
};

export type P76AdminAllowlistApplyMetaListQuery = {
  viewerUserId?: string;
  applied?: boolean;
  rolledBack?: boolean;
  sourceVersion?: string;
  violationOnly?: boolean;
  limit?: number;
  cursor?: string;
};

export type P76AdminAllowlistApplyMetaAggregateV1 = {
  totalSidecarRows: number;
  writtenRows: number;
  dryRunRows: number;
  rolledBackRows: number;
  violationCount: number;
  mainChainViolationCount: number;
  nonAllowlistViolationCount: number;
  artifactMissingCount: number;
  staleSourceVersionCount: number;
  appliedToMatchResultTrueCount: number;
  appliedToFinalScoreTrueCount: number;
  appliedToWorkerRankingTrueCount: number;
  appliedToDisplayTrueCount: number;
};

export type P76AdminAllowlistApplyMetaListResponseV1 = {
  schemaVersion: typeof P76_ADMIN_LIST_SCHEMA_VERSION;
  rows: P76AdminAllowlistApplyMetaRowV1[];
  aggregate: P76AdminAllowlistApplyMetaAggregateV1;
  pagination: {
    limit: number;
    nextCursor: string | null;
  };
};

export type P76AdminAllowlistApplyMetaDetailResponseV1 = {
  schemaVersion: typeof P76_ADMIN_DETAIL_SCHEMA_VERSION;
  row: P76AdminAllowlistApplyMetaRowV1;
  derived: P76AdminAllowlistApplyMetaDerivedV1;
  stageSummary: P76AdminStageSummaryV1;
  violationStatus: P76AdminViolationStatus;
};

export type P76AdminAllowlistApplyMetaAggregateResponseV1 = {
  schemaVersion: typeof P76_ADMIN_AGGREGATE_SCHEMA_VERSION;
} & P76AdminAllowlistApplyMetaAggregateV1;

export type P76AdminArtifactPathChecker = (relativePath: string | null) => boolean;
