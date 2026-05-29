-- P7.6-r8b: Route C allowlist apply sidecar (no MatchResult / worker / display writes).

CREATE TABLE "p76_allowlist_apply_meta" (
    "id" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "selectedCandidateId" TEXT NOT NULL,
    "sourcePipeline" TEXT NOT NULL DEFAULT 'p7.6_route_c',
    "schemaVersion" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "routeCArtifactPath" TEXT,
    "stage1SelectedCandidateIds" JSONB NOT NULL,
    "stage2Top2CandidateIds" JSONB NOT NULL,
    "selectedBy20DOnlyCandidateId" TEXT,
    "selectedByRrmCandidateId" TEXT,
    "finalShadowSelectedCandidateId" TEXT NOT NULL,
    "allowlistMatched" BOOLEAN NOT NULL DEFAULT false,
    "pmSignoffStatus" TEXT NOT NULL DEFAULT 'pending',
    "opsSignoffStatus" TEXT NOT NULL DEFAULT 'pending',
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedToPool" BOOLEAN NOT NULL DEFAULT false,
    "appliedToMatchResult" BOOLEAN NOT NULL DEFAULT false,
    "appliedToFinalScore" BOOLEAN NOT NULL DEFAULT false,
    "appliedToDisplay" BOOLEAN NOT NULL DEFAULT false,
    "appliedToWorkerRanking" BOOLEAN NOT NULL DEFAULT false,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,
    "rollbackReason" TEXT,
    "rollbackToken" TEXT,
    "auditNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p76_allowlist_apply_meta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "p76_allowlist_apply_meta_viewerUserId_sourceVersion_key" ON "p76_allowlist_apply_meta"("viewerUserId", "sourceVersion");

CREATE INDEX "p76_allowlist_apply_meta_viewerUserId_idx" ON "p76_allowlist_apply_meta"("viewerUserId");

CREATE INDEX "p76_allowlist_apply_meta_selectedCandidateId_idx" ON "p76_allowlist_apply_meta"("selectedCandidateId");

CREATE INDEX "p76_allowlist_apply_meta_applied_idx" ON "p76_allowlist_apply_meta"("applied");

CREATE INDEX "p76_allowlist_apply_meta_rolledBack_idx" ON "p76_allowlist_apply_meta"("rolledBack");

CREATE INDEX "p76_allowlist_apply_meta_createdAt_idx" ON "p76_allowlist_apply_meta"("createdAt");

CREATE INDEX "p76_allowlist_apply_meta_sourceVersion_idx" ON "p76_allowlist_apply_meta"("sourceVersion");

ALTER TABLE "p76_allowlist_apply_meta" ADD CONSTRAINT "p76_allowlist_apply_meta_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
