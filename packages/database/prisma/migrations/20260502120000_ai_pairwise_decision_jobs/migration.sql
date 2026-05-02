-- CreateTable
CREATE TABLE "ai_pairwise_decision_jobs" (
    "id" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "shortlistFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sourceVersion" TEXT NOT NULL,
    "shortlistSnapshot" JSONB NOT NULL,
    "decisionResult" JSONB,
    "failureDetail" JSONB,
    "fallbackUsed" BOOLEAN,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_pairwise_decision_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_pairwise_decision_jobs_viewer_pool_fp_version_status_idx" ON "ai_pairwise_decision_jobs"("viewerUserId", "poolId", "shortlistFingerprint", "sourceVersion", "status");

-- AddForeignKey
ALTER TABLE "ai_pairwise_decision_jobs" ADD CONSTRAINT "ai_pairwise_decision_jobs_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
