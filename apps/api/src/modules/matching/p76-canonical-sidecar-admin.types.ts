/**
 * P7.7-r4.1 — admin read API contracts for canonical match result sidecar meta.
 */

import type { Prisma } from "@peima/database";

export const P76_CANONICAL_SIDECAR_ADMIN_LIST_SCHEMA_VERSION =
  "p7.7-r4-admin-canonical-sidecar-list-v1" as const;

export const P76_CANONICAL_SIDECAR_ADMIN_DETAIL_SCHEMA_VERSION =
  "p7.7-r4-admin-canonical-sidecar-detail-v1" as const;

export const P76_CANONICAL_SIDECAR_ADMIN_AGGREGATE_SCHEMA_VERSION =
  "p7.7-r4-admin-canonical-sidecar-aggregate-v1" as const;

export const P76_CANONICAL_SIDECAR_ADMIN_DEFAULT_LIST_LIMIT = 50;
export const P76_CANONICAL_SIDECAR_ADMIN_MAX_LIST_LIMIT = 100;

export type P76CanonicalMatchResultMetaDbRow =
  Prisma.P76CanonicalMatchResultMetaGetPayload<object>;

export type P76CanonicalSidecarAdminSafetyV1 = {
  isSidecarOnly: boolean;
  notAppliedToMatchResult: boolean;
  notAppliedToFinalScore: boolean;
  notAppliedToWorkerRanking: boolean;
  readByGetPath: false;
  readByWorker: false;
};

export type P76CanonicalSidecarAdminListItem = {
  id: string;
  auditRunId: string;
  environment: string;
  viewerUserId: string;
  matchResultId: string | null;
  selectedCandidateId: string;
  sourceType: string;
  sourceVersion: string;
  schemaVersion: number;
  mode: string;
  score: number | null;
  promotionStatus: string;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
  rolledBack: boolean;
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  createdAt: string;
  updatedAt: string;
  supersededAt: string | null;
  deletedAt: string | null;
  safety: P76CanonicalSidecarAdminSafetyV1;
};

export type P76CanonicalSidecarAdminListQuery = {
  auditRunId?: string;
  environment?: string;
  viewerUserId?: string;
  matchResultId?: string;
  selectedCandidateId?: string;
  sourceVersion?: string;
  mode?: string;
  promotionStatus?: string;
  appliedToMatchResult?: boolean;
  appliedToFinalScore?: boolean;
  appliedToWorkerRanking?: boolean;
  rolledBack?: boolean;
  activeOnly?: boolean;
  includeDeleted?: boolean;
  generatedAtFrom?: string;
  generatedAtTo?: string;
  limit?: number;
  cursor?: string;
};

export type P76CanonicalSidecarAdminPageInfo = {
  limit: number;
  nextCursor: string | null;
  totalCount: number;
};

export type P76CanonicalSidecarAdminAggregateV1 = {
  totalVisible: number;
  sidecarOnlyCount: number;
  promotedCount: number;
  blockedCount: number;
  rolledBackCount: number;
  appliedToMatchResultViolationCount: number;
  appliedToFinalScoreViolationCount: number;
  appliedToWorkerRankingViolationCount: number;
  promotionStatusCounts: Record<string, number>;
  modeCounts: Record<string, number>;
  sourceVersionCounts: Record<string, number>;
  environmentCounts: Record<string, number>;
  latestAuditRunIds: string[];
};

export type P76CanonicalSidecarAdminListResponse = {
  schemaVersion: typeof P76_CANONICAL_SIDECAR_ADMIN_LIST_SCHEMA_VERSION;
  featureEnabled: true;
  items: P76CanonicalSidecarAdminListItem[];
  pageInfo: P76CanonicalSidecarAdminPageInfo;
  aggregate: P76CanonicalSidecarAdminAggregateV1;
};

export type P76CanonicalSidecarAdminDetail = P76CanonicalSidecarAdminListItem & {
  reasonSummary: string | null;
  stageSummary: unknown;
  safeFallbackMeta: unknown;
  guardrails: unknown;
  dryRunPayload: unknown;
  promotionTargetMatchResultId: string | null;
  rollbackTokenPresent: boolean;
  previousSnapshotHashPresent: boolean;
};

export type P76CanonicalSidecarAdminDetailResponse = {
  schemaVersion: typeof P76_CANONICAL_SIDECAR_ADMIN_DETAIL_SCHEMA_VERSION;
  featureEnabled: true;
  row: P76CanonicalSidecarAdminDetail;
  links: {
    rehearsalAdminPath: string | null;
    allowlistApplyMetaAdminPath: string | null;
  };
};

export type P76CanonicalSidecarAdminAggregateResponse = {
  schemaVersion: typeof P76_CANONICAL_SIDECAR_ADMIN_AGGREGATE_SCHEMA_VERSION;
  featureEnabled: true;
} & P76CanonicalSidecarAdminAggregateV1;
