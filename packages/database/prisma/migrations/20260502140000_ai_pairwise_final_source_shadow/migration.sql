-- M3.8-M9: nullable JSON sidecar for pairwise final source shadow (Phase 2; no MatchResult writes).
ALTER TABLE "ai_pairwise_decision_jobs" ADD COLUMN "finalSourceShadow" JSONB;
