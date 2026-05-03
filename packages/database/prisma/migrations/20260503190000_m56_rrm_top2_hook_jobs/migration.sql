-- M5.6-B1: RRM Top2 display hook outbox / job table (durable intent; no consumer in this migration).

CREATE TABLE "match_result_rrm_top2_display_hook_jobs" (
    "id" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "staticTop2Snapshot" JSONB NOT NULL,
    "top2Fingerprint" TEXT NOT NULL,
    "rrmSourceType" TEXT NOT NULL,
    "rrmSourceId" TEXT,
    "rrmSummarySourceVersion" TEXT,
    "guardrails" JSONB NOT NULL,
    "noOpReasonCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "metaWriteResult" JSONB,
    "auditMeta" JSONB,
    "aiSimulationJobId" TEXT,
    "pairwiseJobId" TEXT,
    "poolId" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_result_rrm_top2_display_hook_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_result_rrm_top2_display_hook_jobs_matchResultId_top2Fingerprint_sourceVersion_key" ON "match_result_rrm_top2_display_hook_jobs"("matchResultId", "top2Fingerprint", "sourceVersion");

CREATE INDEX "match_result_rrm_top2_display_hook_jobs_status_createdAt_idx" ON "match_result_rrm_top2_display_hook_jobs"("status", "createdAt");

CREATE INDEX "match_result_rrm_top2_display_hook_jobs_viewerUserId_status_idx" ON "match_result_rrm_top2_display_hook_jobs"("viewerUserId", "status");

CREATE INDEX "match_result_rrm_top2_display_hook_jobs_matchResultId_idx" ON "match_result_rrm_top2_display_hook_jobs"("matchResultId");

CREATE INDEX "match_result_rrm_top2_display_hook_jobs_rrmSourceType_rrmSourceId_idx" ON "match_result_rrm_top2_display_hook_jobs"("rrmSourceType", "rrmSourceId");

ALTER TABLE "match_result_rrm_top2_display_hook_jobs" ADD CONSTRAINT "match_result_rrm_top2_display_hook_jobs_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "match_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_result_rrm_top2_display_hook_jobs" ADD CONSTRAINT "match_result_rrm_top2_display_hook_jobs_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
