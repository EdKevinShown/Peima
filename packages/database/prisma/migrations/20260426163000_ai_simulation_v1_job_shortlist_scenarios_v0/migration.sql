-- Phase C v0.3: persisted shortlist standardized scene evidence sidecar on AI simulation job.
ALTER TABLE "ai_simulation_v1_jobs"
ADD COLUMN "shortlistScenariosV0" JSONB;
