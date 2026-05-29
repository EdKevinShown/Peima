-- P7.10-r8c: canonical apply rollback snapshot (additive only; no MatchResult mutation).
-- Stores redacted before/proposed baseline + optional rollback token hash only.

CREATE TABLE "p76_canonical_apply_rollback_snapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sidecarId" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,

    "beforeCandidateUserId" TEXT NOT NULL,
    "beforeFinalScore" DOUBLE PRECISION NOT NULL,
    "beforeReasonSummary" TEXT,
    "beforeMatchInsightsChecksum" TEXT,
    "beforeMatchInsightsSummaryJson" JSONB,
    "beforeUpdatedAt" TIMESTAMP(3),
    "baselineFingerprint" TEXT NOT NULL,

    "proposedCandidateUserId" TEXT NOT NULL,
    "proposedFinalScore" DOUBLE PRECISION NOT NULL,
    "proposedReasonSummary" TEXT,
    "proposedSourceVersion" TEXT,

    "rollbackTokenHash" TEXT,
    "rollbackExpiresAt" TIMESTAMP(3),
    "rollbackUsedAt" TIMESTAMP(3),
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rolledBackAt" TIMESTAMP(3),
    "rollbackReason" TEXT,

    "applyAuditRunId" TEXT,
    "appliedBy" TEXT,
    "approvedByPm" TEXT,
    "approvedByOps" TEXT,
    "approvedByEngineering" TEXT,
    "promotionStatus" TEXT NOT NULL DEFAULT 'snapshot_created',

    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p76_canonical_apply_rollback_snapshot_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "p76_canonical_apply_rollback_snapshot_environment_allowed"
        CHECK ("environment" IN ('dev', 'staging', 'production-like-staging')),

    CONSTRAINT "p76_canonical_apply_rollback_snapshot_promotion_status_allowed"
        CHECK ("promotionStatus" IN (
            'snapshot_created',
            'apply_pending',
            'applied',
            'rollback_completed',
            'expired',
            'superseded'
        ))
);

CREATE UNIQUE INDEX "p76_canonical_apply_rollback_snapshot_snapshotId_key"
    ON "p76_canonical_apply_rollback_snapshot"("snapshotId");

CREATE INDEX "p76_canonical_apply_rollback_snapshot_sidecarId_idx"
    ON "p76_canonical_apply_rollback_snapshot"("sidecarId");

CREATE INDEX "p76_canonical_apply_rollback_snapshot_matchResultId_idx"
    ON "p76_canonical_apply_rollback_snapshot"("matchResultId");

CREATE INDEX "p76_canonical_apply_rollback_snapshot_viewerUserId_idx"
    ON "p76_canonical_apply_rollback_snapshot"("viewerUserId");

CREATE INDEX "p76_canonical_apply_rollback_snapshot_rollbackExpiresAt_idx"
    ON "p76_canonical_apply_rollback_snapshot"("rollbackExpiresAt");

CREATE INDEX "p76_canonical_apply_rollback_snapshot_rolledBack_idx"
    ON "p76_canonical_apply_rollback_snapshot"("rolledBack");

CREATE INDEX "p76_canonical_apply_rollback_snapshot_promotionStatus_idx"
    ON "p76_canonical_apply_rollback_snapshot"("promotionStatus");
