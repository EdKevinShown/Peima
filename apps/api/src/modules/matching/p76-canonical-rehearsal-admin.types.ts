/**
 * P7.7-r3.1 — admin read API contracts for canonical writer rehearsal sidecar.
 */

import type { Prisma } from "@peima/database";

export const P76_REHEARSAL_ADMIN_LIST_SCHEMA_VERSION =
  "p7.7-r3-admin-canonical-rehearsal-list-v1" as const;

export const P76_REHEARSAL_ADMIN_DETAIL_SCHEMA_VERSION =
  "p7.7-r3-admin-canonical-rehearsal-detail-v1" as const;

export const P76_REHEARSAL_ADMIN_AGGREGATE_SCHEMA_VERSION =
  "p7.7-r3-admin-canonical-rehearsal-aggregate-v1" as const;

export const P76_REHEARSAL_ADMIN_DEFAULT_LIST_LIMIT = 50;
export const P76_REHEARSAL_ADMIN_MAX_LIST_LIMIT = 100;

export type P76CanonicalRehearsalMetaDbRow =
  Prisma.P76CanonicalWriterRehearsalMetaGetPayload<object>;

export type P76RehearsalAdminDerivedV1 = {
  rehearsalStatus: "shadow_only";
  productApplyStatus: "not_applied";
  mainChainApplyStatus: "none" | "violation_detected";
  violationStatus: "ok" | "p0_applied_to_match_result";
};

export type P76CanonicalRehearsalAdminListItem = {
  id: string;
  generatedAt: string;
  viewerUserId: string;
  matchResultId: string;
  baselineCandidateUserId: string | null;
  proposedCandidateUserId: string | null;
  wouldChangeCandidate: boolean;
  eligible: boolean;
  guardrailReason: string;
  scoreDeltaBand: string | null;
  sourceVersion: string;
  pipelineVersion: string;
  readPathSourceVersion: string | null;
  auditRunId: string;
  environment: string;
  appliedToMatchResult: false;
  rehearsalMode: string;
  supersededAt: string | null;
  deletedAt: string | null;
} & P76RehearsalAdminDerivedV1;

export type P76RehearsalAdminListQuery = {
  auditRunId?: string;
  sourceVersion?: string;
  readPathSourceVersion?: string;
  environment?: string;
  eligible?: boolean;
  guardrailReason?: string;
  wouldChangeCandidate?: boolean;
  appliedToMatchResult?: boolean;
  generatedAtFrom?: string;
  generatedAtTo?: string;
  viewerUserId?: string;
  matchResultId?: string;
  activeOnly?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  cursor?: string;
};

export type P76RehearsalAdminAggregateV1 = {
  totalVisible: number;
  eligibleCount: number;
  blockedCount: number;
  wouldChangeCandidateCount: number;
  appliedToMatchResultViolationCount: number;
  reasonCounts: Record<string, number>;
  environmentCounts: Record<string, number>;
  latestAuditRunIds: string[];
};

export type P76CanonicalRehearsalAdminListResponse = {
  schemaVersion: typeof P76_REHEARSAL_ADMIN_LIST_SCHEMA_VERSION;
  featureEnabled: true;
  items: P76CanonicalRehearsalAdminListItem[];
  pageInfo: {
    limit: number;
    nextCursor: string | null;
    totalCount: number;
  };
  aggregate: P76RehearsalAdminAggregateV1;
};

export type P76CanonicalRehearsalAdminDetailResponse = {
  schemaVersion: typeof P76_REHEARSAL_ADMIN_DETAIL_SCHEMA_VERSION;
  featureEnabled: true;
  row: P76CanonicalRehearsalAdminListItem;
  shadow: Record<string, unknown>;
  summary: Record<string, unknown> | null;
  derived: P76RehearsalAdminDerivedV1;
  links: {
    allowlistApplyMetaId: string | null;
    allowlistApplyMetaAdminPath: string | null;
  };
};

export type P76RehearsalAdminAggregateResponse = {
  schemaVersion: typeof P76_REHEARSAL_ADMIN_AGGREGATE_SCHEMA_VERSION;
  featureEnabled: true;
} & P76RehearsalAdminAggregateV1;
