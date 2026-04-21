-- P2/P3 hardening: support timeline hot paths with composite indexes.

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "user_feedbacks_userId_subjectKind_subjectId_recordedAt_idx"
ON "user_feedbacks"("userId", "subjectKind", "subjectId", "recordedAt");
