-- Phase C step 2: persisted shortlist AI decision sidecar on job aggregate.
ALTER TABLE "ai_simulation_v1_jobs"
ADD COLUMN "shortlistDecisionV0" JSONB;
