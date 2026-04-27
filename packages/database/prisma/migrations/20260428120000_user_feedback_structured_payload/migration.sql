-- P6.12: optional JSON payload for chat feedback (v0).
ALTER TABLE "user_feedbacks" ADD COLUMN "structuredPayload" JSONB;
