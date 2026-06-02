-- CreateTable
CREATE TABLE "testing_observability_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "matchResultId" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "sourceVersion" TEXT,
    "fallbackUsed" BOOLEAN,
    "errorCode" TEXT,
    "message" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testing_observability_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testing_match_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchResultId" TEXT,
    "rating" TEXT NOT NULL,
    "reasonCodes" JSONB,
    "freeText" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testing_match_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "testing_observability_events_userId_createdAt_idx" ON "testing_observability_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "testing_observability_events_matchResultId_createdAt_idx" ON "testing_observability_events"("matchResultId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "testing_observability_events_eventType_createdAt_idx" ON "testing_observability_events"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "testing_match_feedback_userId_createdAt_idx" ON "testing_match_feedback"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "testing_match_feedback_matchResultId_createdAt_idx" ON "testing_match_feedback"("matchResultId", "createdAt" DESC);
