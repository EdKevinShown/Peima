-- CreateTable
CREATE TABLE "ai_simulation_v1_jobs" (
    "id" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "runSpecVersion" TEXT NOT NULL,
    "hintSource" TEXT NOT NULL,
    "hintSnapshot" JSONB NOT NULL,
    "simulationQueueActual" JSONB NOT NULL,
    "jobStatus" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_simulation_v1_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_simulation_v1_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "transcriptLite" JSONB,
    "evaluator" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_simulation_v1_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_simulation_v1_items_jobId_idx" ON "ai_simulation_v1_items"("jobId");

-- AddForeignKey
ALTER TABLE "ai_simulation_v1_jobs" ADD CONSTRAINT "ai_simulation_v1_jobs_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_simulation_v1_items" ADD CONSTRAINT "ai_simulation_v1_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_simulation_v1_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
