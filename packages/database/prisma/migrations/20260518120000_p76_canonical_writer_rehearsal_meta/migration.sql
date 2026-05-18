-- P7.10-r6e1: canonical writer rehearsal sidecar (compare-only; dev/staging).
-- No MatchResult / matchInsights / worker / GET integration.

CREATE TABLE "p76_canonical_writer_rehearsal_meta" (
    "id" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "baselineCandidateUserId" TEXT,
    "proposedCandidateUserId" TEXT,
    "baselineFinalScore" DOUBLE PRECISION,
    "proposedScore" DOUBLE PRECISION,
    "scoreVersion" TEXT,
    "wouldChangeCandidate" BOOLEAN NOT NULL DEFAULT false,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "guardrailReason" TEXT NOT NULL,
    "scoreDeltaBand" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "readPathSourceVersion" TEXT,
    "allowlistApplyMetaId" TEXT,
    "auditRunId" TEXT NOT NULL,
    "rehearsalMode" TEXT NOT NULL DEFAULT 'sidecar_rehearsal',
    "environment" TEXT NOT NULL DEFAULT 'dev',
    "appliedToMatchResult" BOOLEAN NOT NULL DEFAULT false,
    "shadowPayload" JSONB NOT NULL,
    "summary" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p76_canonical_writer_rehearsal_meta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "p76_canonical_writer_rehearsal_meta_applied_to_match_result_false"
        CHECK ("appliedToMatchResult" = false),
    CONSTRAINT "p76_canonical_writer_rehearsal_meta_environment_allowed"
        CHECK ("environment" IN ('dev', 'staging'))
);

CREATE UNIQUE INDEX "p76_canonical_writer_rehearsal_meta_matchResultId_auditRunId_pipelineVersion_key"
    ON "p76_canonical_writer_rehearsal_meta"("matchResultId", "auditRunId", "pipelineVersion");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_viewerUserId_idx"
    ON "p76_canonical_writer_rehearsal_meta"("viewerUserId");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_matchResultId_idx"
    ON "p76_canonical_writer_rehearsal_meta"("matchResultId");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_sourceVersion_idx"
    ON "p76_canonical_writer_rehearsal_meta"("sourceVersion");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_readPathSourceVersion_idx"
    ON "p76_canonical_writer_rehearsal_meta"("readPathSourceVersion");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_auditRunId_idx"
    ON "p76_canonical_writer_rehearsal_meta"("auditRunId");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_eligible_idx"
    ON "p76_canonical_writer_rehearsal_meta"("eligible");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_guardrailReason_idx"
    ON "p76_canonical_writer_rehearsal_meta"("guardrailReason");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_appliedToMatchResult_idx"
    ON "p76_canonical_writer_rehearsal_meta"("appliedToMatchResult");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_supersededAt_idx"
    ON "p76_canonical_writer_rehearsal_meta"("supersededAt");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_generatedAt_idx"
    ON "p76_canonical_writer_rehearsal_meta"("generatedAt");

CREATE INDEX "p76_canonical_writer_rehearsal_meta_environment_generatedAt_idx"
    ON "p76_canonical_writer_rehearsal_meta"("environment", "generatedAt");
