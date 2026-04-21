-- P6.8: message cursor on each suggestion row (R1 / R3); partial unique for concurrent single-pending (R2 / P6).
ALTER TABLE "profile_update_suggestions" ADD COLUMN "generatedUpToMessageId" TEXT;

CREATE UNIQUE INDEX "profile_update_suggestions_p6_pending_one_per_conv_idx"
ON "profile_update_suggestions" ("userId", "sourceConversationId", "sourceVersion")
WHERE
  "status" = 'pending'
  AND "sourceVersion" = 'p6.8-profile-completion-chat-ai-v1'
  AND "sourceConversationId" IS NOT NULL
  AND "sourceType" = 'hybrid';
