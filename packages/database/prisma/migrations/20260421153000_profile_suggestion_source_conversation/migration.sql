-- P6.8: tie a profile suggestion to a chat conversation (pending duplicate guard per conversation + version).
ALTER TABLE "profile_update_suggestions" ADD COLUMN "sourceConversationId" TEXT;

CREATE INDEX "profile_update_suggestions_user_conv_srcver_status_idx"
ON "profile_update_suggestions" ("userId", "sourceConversationId", "sourceVersion", "status");
