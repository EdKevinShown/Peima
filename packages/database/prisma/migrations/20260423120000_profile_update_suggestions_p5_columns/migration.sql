-- Align profile_update_suggestions with schema.prisma (P5 columns + indexes).
-- Idempotent: same columns/indexes may already exist from 20260411120000_p5_rbac_audit_notifications.

ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'profile_refinement';
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "assignedToOperatorId" TEXT;
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "operatorNotes" TEXT;
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "profile_update_suggestions_status_priority_idx" ON "profile_update_suggestions" ("status", "priority");
CREATE INDEX IF NOT EXISTS "profile_update_suggestions_assignedToOperatorId_idx" ON "profile_update_suggestions" ("assignedToOperatorId");
CREATE INDEX IF NOT EXISTS "profile_update_suggestions_versionNumber_idx" ON "profile_update_suggestions" ("versionNumber");
