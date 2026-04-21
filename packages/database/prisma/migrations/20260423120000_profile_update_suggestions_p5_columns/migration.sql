-- Align profile_update_suggestions with schema.prisma (P5 columns + indexes).
-- Prior migrations only created the MVP table + sourceConversationId; these columns were never migrated.

ALTER TABLE "profile_update_suggestions" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "profile_update_suggestions" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'profile_refinement';
ALTER TABLE "profile_update_suggestions" ADD COLUMN "assignedToOperatorId" TEXT;
ALTER TABLE "profile_update_suggestions" ADD COLUMN "operatorNotes" TEXT;
ALTER TABLE "profile_update_suggestions" ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "profile_update_suggestions_status_priority_idx" ON "profile_update_suggestions" ("status", "priority");
CREATE INDEX "profile_update_suggestions_assignedToOperatorId_idx" ON "profile_update_suggestions" ("assignedToOperatorId");
CREATE INDEX "profile_update_suggestions_versionNumber_idx" ON "profile_update_suggestions" ("versionNumber");
