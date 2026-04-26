-- Phase C v0: auditable shortlist binding for AI simulation enqueue (orchestrator A2).
ALTER TABLE "ai_simulation_v1_jobs"
ADD COLUMN "shortlistBinding" JSONB;
