-- P2-MVP persistence: chat summary snapshots, structured feedback, profile suggestions, behavior signals.
-- Aligns migration history with schema.prisma (previously only present via db push / manual DBs).

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "chatStageHint" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_feedbacks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "rating" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_update_suggestions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "proposedPatch" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "profile_update_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_signals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT,
    "sessionId" TEXT,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_summaries_conversationId_createdAt_idx" ON "conversation_summaries"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "user_feedbacks_userId_recordedAt_idx" ON "user_feedbacks"("userId", "recordedAt");

-- CreateIndex
CREATE INDEX "profile_update_suggestions_userId_status_idx" ON "profile_update_suggestions"("userId", "status");

-- CreateIndex
CREATE INDEX "behavior_signals_userId_occurredAt_idx" ON "behavior_signals"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "behavior_signals_conversationId_idx" ON "behavior_signals"("conversationId");

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_update_suggestions" ADD CONSTRAINT "profile_update_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_signals" ADD CONSTRAINT "behavior_signals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_signals" ADD CONSTRAINT "behavior_signals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
