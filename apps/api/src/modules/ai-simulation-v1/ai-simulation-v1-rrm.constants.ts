/** RRM-ready multi-scenario simulation (M0.6-Full → M0.8: 7 scenarios). */
export const AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2 = 2 as const;

/**
 * Canonical `sourceVersion` for new 7-scenario v2 completions (M0.8.1).
 * Injected on persist; model may omit — server normalizes before save.
 */
export const AI_SIMULATION_RRM_SOURCE_VERSION = "ai-match-simulation-rrm-ready-v2" as const;

/** Pre–M0.8.1 persisted v2 rows (typically 3 `scenarioResults`) may still carry this value; read paths tolerate it. */
export const AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1 = "ai-match-simulation-rrm-ready-v1" as const;

export const AI_SIMULATION_RRM_SOURCE_TYPE = "ai_simulation_llm_completion" as const;

/**
 * Fixed order for v2 `scenarioResults` (M0.8). Validator requires exactly this sequence and length.
 */
export const RRM_SCENARIO_KEYS_ORDERED = [
  "low_pressure_first_chat",
  "topic_expansion",
  "personal_sharing",
  "emotional_support_light",
  "pace_negotiation",
  "low_pressure_invitation",
  "minor_misunderstanding_repair",
] as const;

export type RrmScenarioKeyV1 = (typeof RRM_SCENARIO_KEYS_ORDERED)[number];

/** Expected scenarioApproachIntensity per scenario (server validates ±ε). */
export const RRM_SCENARIO_APPROACH_INTENSITY: Record<RrmScenarioKeyV1, number> = {
  low_pressure_first_chat: 0.2,
  topic_expansion: 0.25,
  personal_sharing: 0.35,
  emotional_support_light: 0.3,
  pace_negotiation: 0.4,
  low_pressure_invitation: 0.45,
  minor_misunderstanding_repair: 0.35,
};

/**
 * Pre–M0.8 persisted v2 jobs (3 scenarios). Still accepted by `isAiSimulationTranscriptLiteV2` / fourDim read path only;
 * new LLM completions must use `RRM_SCENARIO_KEYS_ORDERED` (length 7).
 */
export const RRM_LEGACY_V2_SCENARIO_KEYS_ORDERED = [
  "low_pressure_first_chat",
  "personal_sharing",
  "low_pressure_invitation",
] as const;

export type RrmLegacyV2ScenarioKey = (typeof RRM_LEGACY_V2_SCENARIO_KEYS_ORDERED)[number];

export const RRM_LEGACY_V2_SCENARIO_APPROACH_INTENSITY: Record<RrmLegacyV2ScenarioKey, number> = {
  low_pressure_first_chat: 0.2,
  personal_sharing: 0.35,
  low_pressure_invitation: 0.45,
};

export const RRM_NEXT_STEP_SUITABILITY = [
  "continue_lightly",
  "maintain",
  "soft_progress",
  "slow_down",
  "stop_or_step_back",
] as const;

export type RrmNextStepSuitability = (typeof RRM_NEXT_STEP_SUITABILITY)[number];
