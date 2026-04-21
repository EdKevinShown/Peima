-- P6.8: persisted accepted chat hints (merge into layer1 as supplement only; questionnaire answers remain SOT).
ALTER TABLE "user_profile" ADD COLUMN "dimensionBranchChatHints" JSONB;
