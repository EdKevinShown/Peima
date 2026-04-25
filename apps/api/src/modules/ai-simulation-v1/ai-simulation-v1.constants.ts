export const AI_SIMULATION_V1_SCHEMA = "ai_simulation_v1" as const;
export const AI_SIMULATION_RUN_SPEC_V1 = "ai_simulation_run_v1" as const;
export const AI_SIMULATION_V1_HINT_SOURCE = "post_pool_deep_screen_shadow_v0" as const;

export const AI_SIMULATION_LLM_PAYLOAD_SCHEMA = "ai_simulation_llm_payload_v1" as const;
export const TRANSCRIPT_LITE_SCHEMA_VERSION = "transcript_lite_v1" as const;

/** §2.2 — single budget rule. */
export const SIMULATION_V1_MAX_CANDIDATES_PER_JOB = 8;

/** §3.5 — narrator allowed at most once; fixed at round index 2 (1-based round === 3). */
export const TRANSCRIPT_LITE_NARRATOR_ROUND = 3;

export const JOB_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
} as const;

export const ITEM_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;
