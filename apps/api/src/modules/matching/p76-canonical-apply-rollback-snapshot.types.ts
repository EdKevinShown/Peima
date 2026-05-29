/**
 * P7.10-r7g — canonical apply rollback snapshot dry-run payload (pure; no DB writes).
 */

import type { P76CanonicalApplyPreviewPayloadV1 } from "./p76-canonical-apply-preview.types";

export const P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE =
  "p76_canonical_apply_rollback_snapshot" as const;

export const P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION =
  "p7.10-r7g-rollback-snapshot-builder-v1" as const;

export const P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_DEFAULT_TTL_HOURS_DEV = 72 as const;
export const P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_DEFAULT_TTL_HOURS_PROD_LIKE = 24 as const;

export const P76_CANONICAL_APPLY_ROLLBACK_SCOPE = "match_result_baseline_v1" as const;

export type P76CanonicalApplyRollbackSnapshotMode = "dry_run";

export type P76CanonicalApplyRollbackSnapshotBlockedReason =
  | "missing_sidecar"
  | "missing_sidecar_id"
  | "missing_current_match_result"
  | "viewer_mismatch"
  | "missing_selected_candidate"
  | "preview_not_ready"
  | "sidecar_already_promoted"
  | "sidecar_rolled_back"
  | "sidecar_deleted"
  | "sidecar_superseded"
  | "sidecar_applied_to_worker_ranking"
  | "sidecar_applied_to_match_result"
  | "sidecar_applied_to_final_score";

export type P76MatchInsightsSummaryV1 = {
  hasMatchInsights: boolean;
  topLevelKeys: string[];
  checksum: string;
  hasP76CanonicalWriterMeta: boolean;
  schemaVersion: number | null;
  forbiddenKeysStripped: string[];
};

export type P76CanonicalApplyRollbackSnapshotBeforeV1 = {
  candidateUserId: string | null;
  finalScore: number | null;
  reasonSummary: string | null;
  matchInsightsSummary: P76MatchInsightsSummaryV1 | null;
  updatedAt: string | null;
  baselineFingerprint: string | null;
};

export type P76CanonicalApplyRollbackSnapshotProposedAfterV1 = {
  candidateUserId: string | null;
  finalScore: number | null;
  reasonSummary: string | null;
  sourceVersion: string | null;
};

export type P76CanonicalApplyRollbackSnapshotRollbackV1 = {
  rollbackTokenRequired: true;
  rollbackTokenPreview: "redacted";
  rollbackExpiresAt: string | null;
  rollbackScope: typeof P76_CANONICAL_APPLY_ROLLBACK_SCOPE;
  rollbackTokenHash: null;
};

export type P76CanonicalApplyRollbackSnapshotApprovalsV1 = {
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  engineeringSignoffStatus: string;
};

export type P76CanonicalApplyRollbackSnapshotSafetyV1 = {
  writesDb: false;
  writesMatchResult: false;
  writesFinalScore: false;
  triggersWorker: false;
  changesPercent: false;
  productionRollout: false;
};

export type P76CanonicalApplyRollbackSnapshotV1 = {
  schemaVersion: typeof P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION;
  mode: P76CanonicalApplyRollbackSnapshotMode;
  snapshotReady: boolean;
  blockedReasons: P76CanonicalApplyRollbackSnapshotBlockedReason[];
  snapshotId: string;
  viewerUserId: string;
  matchResultId: string;
  sidecarId: string;
  before: P76CanonicalApplyRollbackSnapshotBeforeV1;
  proposedAfter: P76CanonicalApplyRollbackSnapshotProposedAfterV1;
  rollback: P76CanonicalApplyRollbackSnapshotRollbackV1;
  approvals: P76CanonicalApplyRollbackSnapshotApprovalsV1;
  safety: P76CanonicalApplyRollbackSnapshotSafetyV1;
  capturedAt: string;
  capturedBy: string | null;
  environment: string;
};

export type P76CanonicalApplyRollbackSnapshotBuildInputV1 = {
  sidecar?: {
    id: string;
    auditRunId?: string;
    environment?: string;
    viewerUserId: string;
    matchResultId?: string | null;
    selectedCandidateId?: string | null;
    score?: number | null;
    reasonSummary?: string | null;
    sourceVersion?: string | null;
    promotionStatus?: string | null;
    appliedToMatchResult?: boolean;
    appliedToFinalScore?: boolean;
    appliedToWorkerRanking?: boolean;
    rolledBack?: boolean;
    deletedAt?: string | Date | null;
    supersededAt?: string | Date | null;
    pmSignoffStatus?: string | null;
    opsSignoffStatus?: string | null;
  } | null;
  currentMatchResult?: {
    id: string;
    viewerUserId: string;
    candidateUserId?: string | null;
    finalScore?: number | null;
    reasonSummary?: string | null;
    matchInsights?: unknown;
    updatedAt?: string | Date | null;
  } | null;
  previewPayload: Pick<
    P76CanonicalApplyPreviewPayloadV1,
    "canApply" | "blockedReasons"
  >;
  now?: string | Date;
  rollbackTtlHours?: number;
  environment?: string;
  approvals?: Partial<P76CanonicalApplyRollbackSnapshotApprovalsV1>;
  capturedBy?: string | null;
  snapshotId?: string;
};
