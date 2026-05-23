import type { RrmScenarioKeyV1 } from "./ai-simulation-v1-rrm.constants";
import { RRM_SCENARIO_KEYS_ORDERED } from "./ai-simulation-v1-rrm.constants";
import { AI_SIMULATION_RRM_SOURCE_VERSION } from "./ai-simulation-v1-rrm.constants";
import { RRM_SIM_SOURCE_VERSION } from "../rrm-shared";

export const RRM_SIM_RESULT_SCHEMA_VERSION = 1 as const;

export { RRM_SIM_SOURCE_VERSION };

/** Mirrors the simulation payload this evaluator is designed for. */
export const RRM_SIM_SOURCE_SIMULATION_VERSION = AI_SIMULATION_RRM_SOURCE_VERSION;

/** Seven-scenario aggregation weights (must sum to 1). */
export const RRM_SIM_SCENARIO_WEIGHTS: Record<RrmScenarioKeyV1, number> = {
  low_pressure_first_chat: 0.13,
  topic_expansion: 0.12,
  personal_sharing: 0.16,
  emotional_support_light: 0.15,
  pace_negotiation: 0.15,
  low_pressure_invitation: 0.14,
  minor_misunderstanding_repair: 0.15,
};

(() => {
  const s = RRM_SCENARIO_KEYS_ORDERED.reduce((a, k) => a + RRM_SIM_SCENARIO_WEIGHTS[k], 0);
  if (Math.abs(s - 1) > 1e-6) {
    throw new Error(`RRM_SIM_SCENARIO_WEIGHTS must sum to 1, got ${s}`);
  }
})();

export const RRM_SIM_F_SIM_CAP = 0.85 as const;

/** M1.2 — `progressionWindow` from `simulatedRhythmScore` (0–100); strong_open only at very high scores. */
export const RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN = 85;
export const RRM_SIM_PROGRESSION_SCORE_OPEN_MIN = 60;
export const RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN = 35;

/** Respect gate: same as product RRM-Sim respect branch. */
export const RRM_SIM_RESPECT_R_PRE_GATE = 0.7;

/** Static disagreement / drag on relationship capacity (D_pre) — output layer only; does not change RFI formula. */
export const RRM_SIM_STATIC_D_PRE_GATE = 0.8;
export const RRM_SIM_STATIC_D_PRE_CLOSED_WINDOW = 0.9;

/**
 * When mean interaction quality is very low, do not suggest `soft_progress` (polite-but-shallow chats).
 * Output-layer only.
 */
export const RRM_SIM_LOW_MEAN_Q_SOFT_PROGRESS_CAP = 0.36;

export const RRM_SIM_UNAVAILABLE_NOT_FULL = "simulation_payload_not_full_rrm_ready" as const;

export const RRM_SIM_UNAVAILABLE_EVAL_FAILED = "rrm_evaluator_failed" as const;

export type RrmSimLevelBand = "low" | "medium" | "medium_high" | "high";

export type RrmSimProgressionWindow = "closed" | "weak_open" | "open" | "strong_open";

export type RrmSimSuggestedAction =
  | "continue_lightly"
  | "maintain"
  | "soft_progress"
  | "slow_down"
  | "stop_or_step_back";
