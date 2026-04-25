/** §3.2 implementation notes — single source of truth for thresholds. */
export const PRESCREEN_STATIC_TIER_UP_MIN = 58;
export const PRESCREEN_STATIC_TIER_MID_MIN = 40;

/** Weights: w_s + w_v + w_b = 1 (§3.3). */
export const PRESCREEN_W_STATIC = 0.5;
export const PRESCREEN_W_VERDICT = 0.35;
export const PRESCREEN_W_BANDS = 0.15;

export const PRESCREEN_RULE_VERSION = "prescreen_rule_v0";
export const PRESCREEN_MAX_CANDIDATES = 200;
export const PRESCREEN_MAX_REASON_CODES = 4;
