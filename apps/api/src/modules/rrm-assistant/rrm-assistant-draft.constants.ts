/** Discrete A_draft buckets (M5.1-r7) — not LLM-generated floats. */

export const RRM_ASSISTANT_DRAFT_SCHEMA_VERSION = 1 as const;

export type RrmAssistantDraftAdvancementType =
  | "neutral_chat"
  | "greeting"
  | "open_question"
  | "topic_continuation"
  | "light_compliment"
  | "express_interest"
  | "light_invite"
  | "high_pressure_invite"
  | "romantic_intimacy"
  | "urge_reply_pressure";

export type RrmAssistantADraftBucket =
  | "very_low"
  | "low"
  | "low_to_medium"
  | "medium"
  | "medium_to_high"
  | "high"
  | "very_high";

/** Numeric A_draft for future ActionFit (commit 8); fixed per bucket. */
export const RRM_ASSISTANT_A_DRAFT_BY_BUCKET: Record<RrmAssistantADraftBucket, number> = {
  very_low: 0.05,
  low: 0.12,
  low_to_medium: 0.22,
  medium: 0.32,
  medium_to_high: 0.42,
  high: 0.52,
  very_high: 0.62,
};
