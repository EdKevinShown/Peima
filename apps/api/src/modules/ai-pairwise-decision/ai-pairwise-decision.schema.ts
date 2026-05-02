/** Frozen literals for M3.8-M0 RRM-lite contracts (no DB / no LLM in this milestone). */

export const RELATIONSHIP_SHORTLIST_TOP2_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION = "relationship-shortlist-top2-v1" as const;

export const AI_PAIRWISE_DECISION_SCHEMA_VERSION = 1 as const;
export const AI_PAIRWISE_DECISION_SOURCE_VERSION = "rrm-lite-pairwise-decision-v1" as const;

export const SUGGESTED_ACTION_VALUES = ["maintain", "slow_down", "stop_or_step_back"] as const;
export type SuggestedActionValue = (typeof SUGGESTED_ACTION_VALUES)[number];

export const PROGRESSION_WINDOW_VALUES = ["open", "weak_open", "closed"] as const;
export type ProgressionWindowValue = (typeof PROGRESSION_WINDOW_VALUES)[number];
