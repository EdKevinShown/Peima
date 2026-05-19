/**
 * P7.10-r8c — rollback snapshot persistence (new table only; no MatchResult writes).
 */

import type { Prisma } from "@peima/database";
import type {
  P76CanonicalApplyRollbackSnapshotApprovalsV1,
  P76CanonicalApplyRollbackSnapshotBlockedReason,
  P76CanonicalApplyRollbackSnapshotV1,
} from "./p76-canonical-apply-rollback-snapshot.types";

export const P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_PERSISTENCE_SOURCE_VERSION =
  "p7.10-r8c-rollback-snapshot-persistence-v1" as const;

export type P76CanonicalApplyRollbackSnapshotPersistencePrisma = {
  p76CanonicalApplyRollbackSnapshot: {
    create: (args: {
      data: Prisma.P76CanonicalApplyRollbackSnapshotCreateInput;
    }) => Promise<P76CanonicalApplyRollbackSnapshotPersistedRow>;
  };
};

export type P76CanonicalApplyRollbackSnapshotPersistedRow = {
  id: string;
  snapshotId: string;
  sidecarId: string;
  matchResultId: string;
  viewerUserId: string;
  beforeCandidateUserId: string;
  beforeFinalScore: number;
  beforeReasonSummary: string | null;
  beforeMatchInsightsChecksum: string | null;
  beforeMatchInsightsSummaryJson: Prisma.JsonValue | null;
  beforeUpdatedAt: Date | null;
  baselineFingerprint: string;
  proposedCandidateUserId: string;
  proposedFinalScore: number;
  proposedReasonSummary: string | null;
  proposedSourceVersion: string | null;
  rollbackTokenHash: string | null;
  rollbackExpiresAt: Date | null;
  rollbackUsedAt: Date | null;
  rolledBack: boolean;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
  applyAuditRunId: string | null;
  appliedBy: string | null;
  approvedByPm: string | null;
  approvedByOps: string | null;
  approvedByEngineering: string | null;
  promotionStatus: string;
  sourceType: string;
  sourceVersion: string;
  environment: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateP76CanonicalApplyRollbackSnapshotRecordInput = {
  dryRunSnapshot: P76CanonicalApplyRollbackSnapshotV1;
  rollbackTokenHash?: string | null;
  requestedBy?: string | null;
  auditRunId?: string | null;
  environment?: string;
  approvals?: Partial<P76CanonicalApplyRollbackSnapshotApprovalsV1>;
};

export type P76CanonicalApplyRollbackSnapshotRecordSummary = {
  id: string;
  snapshotId: string;
  sidecarId: string;
  matchResultId: string;
  viewerUserId: string;
  baselineFingerprint: string;
  beforeCandidateUserId: string;
  beforeFinalScore: number;
  proposedCandidateUserId: string;
  proposedFinalScore: number;
  rollbackTokenHash: string | null;
  rolledBack: boolean;
  promotionStatus: string;
  environment: string;
  createdAt: string;
};

export type CreateP76CanonicalApplyRollbackSnapshotRecordBlocked = {
  ok: false;
  reason: "snapshot_not_ready" | "safety_invariant_violation" | "invalid_snapshot_payload";
  blockedReasons: P76CanonicalApplyRollbackSnapshotBlockedReason[];
};

export type CreateP76CanonicalApplyRollbackSnapshotRecordSuccess = {
  ok: true;
  persisted: P76CanonicalApplyRollbackSnapshotRecordSummary;
};

export type CreateP76CanonicalApplyRollbackSnapshotRecordResult =
  | CreateP76CanonicalApplyRollbackSnapshotRecordSuccess
  | CreateP76CanonicalApplyRollbackSnapshotRecordBlocked;
