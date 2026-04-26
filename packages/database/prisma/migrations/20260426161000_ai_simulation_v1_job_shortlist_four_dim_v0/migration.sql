-- Phase C v0.2: persisted shortlist 4-dim comparison sidecar on AI simulation job.
ALTER TABLE "ai_simulation_v1_jobs"
ADD COLUMN "shortlistFourDimV0" JSONB;
