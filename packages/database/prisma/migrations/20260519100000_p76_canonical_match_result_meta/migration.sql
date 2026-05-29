-- P7.10-r3e: canonical match result sidecar (promotion source; dev/staging only).
-- No MatchResult / matchInsights mutation from this migration.

CREATE TABLE "p76_canonical_match_result_meta" (
    "id" TEXT NOT NULL,

    "auditRunId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'dev',

    "viewerUserId" TEXT NOT NULL,
    "matchResultId" TEXT,
    "selectedCandidateId" TEXT NOT NULL,

    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,

    "score" DOUBLE PRECISION,
    "reasonSummary" TEXT,

    "stageSummary" JSONB,
    "safeFallbackMeta" JSONB,
    "guardrails" JSONB,
    "dryRunPayload" JSONB,

    "appliedToMatchResult" BOOLEAN NOT NULL DEFAULT false,
    "appliedToFinalScore" BOOLEAN NOT NULL DEFAULT false,
    "appliedToWorkerRanking" BOOLEAN NOT NULL DEFAULT false,

    "promotionStatus" TEXT NOT NULL DEFAULT 'not_promoted',
    "promotionTargetMatchResultId" TEXT,
    "rollbackToken" TEXT,
    "previousSnapshotHash" TEXT,

    "pmSignoffStatus" TEXT NOT NULL DEFAULT 'not_required',
    "opsSignoffStatus" TEXT NOT NULL DEFAULT 'not_required',

    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "supersededAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p76_canonical_match_result_meta_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "p76_canonical_match_result_meta_applied_to_worker_ranking_false"
        CHECK ("appliedToWorkerRanking" = false),

    CONSTRAINT "p76_canonical_match_result_meta_mode_allowed"
        CHECK ("mode" IN ('dry_run', 'sidecar', 'promoted')),

    CONSTRAINT "p76_canonical_match_result_meta_promotion_status_allowed"
        CHECK ("promotionStatus" IN ('not_promoted', 'promoted', 'rolled_back', 'blocked')),

    CONSTRAINT "p76_canonical_match_result_meta_applied_match_result_requires_promoted"
        CHECK (NOT ("appliedToMatchResult" = true AND "promotionStatus" <> 'promoted')),

    CONSTRAINT "p76_canonical_match_result_meta_applied_final_score_requires_promoted"
        CHECK (NOT ("appliedToFinalScore" = true AND "promotionStatus" <> 'promoted')),

    CONSTRAINT "p76_canonical_match_result_meta_environment_allowed"
        CHECK ("environment" IN ('dev', 'staging')),

    CONSTRAINT "p76_canonical_match_result_meta_rolled_back_promotion_consistent"
        CHECK (NOT ("rolledBack" = true AND "promotionStatus" NOT IN ('rolled_back', 'blocked')))
);

CREATE UNIQUE INDEX "p76_canonical_match_result_meta_auditRunId_viewerUserId_sourceVersion_key"
    ON "p76_canonical_match_result_meta"("auditRunId", "viewerUserId", "sourceVersion");

CREATE UNIQUE INDEX "p76_canonical_match_result_meta_active_sidecar_viewer_source_key"
    ON "p76_canonical_match_result_meta"("viewerUserId", "sourceVersion")
    WHERE "mode" = 'sidecar'
      AND "deletedAt" IS NULL
      AND "supersededAt" IS NULL
      AND "promotionStatus" = 'not_promoted';

CREATE INDEX "p76_canonical_match_result_meta_viewerUserId_idx"
    ON "p76_canonical_match_result_meta"("viewerUserId");

CREATE INDEX "p76_canonical_match_result_meta_selectedCandidateId_idx"
    ON "p76_canonical_match_result_meta"("selectedCandidateId");

CREATE INDEX "p76_canonical_match_result_meta_matchResultId_idx"
    ON "p76_canonical_match_result_meta"("matchResultId");

CREATE INDEX "p76_canonical_match_result_meta_sourceVersion_idx"
    ON "p76_canonical_match_result_meta"("sourceVersion");

CREATE INDEX "p76_canonical_match_result_meta_mode_idx"
    ON "p76_canonical_match_result_meta"("mode");

CREATE INDEX "p76_canonical_match_result_meta_promotionStatus_idx"
    ON "p76_canonical_match_result_meta"("promotionStatus");

CREATE INDEX "p76_canonical_match_result_meta_appliedToMatchResult_idx"
    ON "p76_canonical_match_result_meta"("appliedToMatchResult");

CREATE INDEX "p76_canonical_match_result_meta_rolledBack_idx"
    ON "p76_canonical_match_result_meta"("rolledBack");

CREATE INDEX "p76_canonical_match_result_meta_createdAt_idx"
    ON "p76_canonical_match_result_meta"("createdAt");

CREATE INDEX "p76_canonical_match_result_meta_supersededAt_idx"
    ON "p76_canonical_match_result_meta"("supersededAt");

CREATE INDEX "p76_canonical_match_result_meta_deletedAt_idx"
    ON "p76_canonical_match_result_meta"("deletedAt");

CREATE INDEX "p76_canonical_match_result_meta_environment_createdAt_idx"
    ON "p76_canonical_match_result_meta"("environment", "createdAt");
