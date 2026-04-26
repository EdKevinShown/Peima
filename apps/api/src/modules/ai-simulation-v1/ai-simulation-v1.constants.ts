export const AI_SIMULATION_V1_SCHEMA = "ai_simulation_v1" as const;
export const AI_SIMULATION_RUN_SPEC_V1 = "ai_simulation_run_v1" as const;
export const AI_SIMULATION_V1_HINT_SOURCE = "post_pool_deep_screen_shadow_v0" as const;

/**
 * Second argument to `AiSimulationV1Service.enqueue` — only the Round 2 orchestrator MVP
 * (`runOrchestrationMvp` + `resolveShortlistSimulationForMvp`) may create jobs.
 */
export const AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE = "post_pool_orchestration_mvp_enqueue" as const;

/** Response `code` when `POST /admin/ai-simulation/v1/enqueue` is called (endpoint retired). */
export const AI_SIMULATION_V1_ENQUEUE_HTTP_DEPRECATED_CODE =
  "AI_SIMULATION_V1_ENQUEUE_HTTP_DEPRECATED_USE_ORCHESTRATION_MVP" as const;

export const AI_SIMULATION_LLM_PAYLOAD_SCHEMA = "ai_simulation_llm_payload_v1" as const;
export const TRANSCRIPT_LITE_SCHEMA_VERSION = "transcript_lite_v1" as const;

/** Phase C 第二步 — job 聚合侧车：`shortlistDecisionV0.schemaVersion`。 */
export const SHORTLIST_DECISION_V0_SCHEMA = "shortlist_decision_v0" as const;
/** Phase C v0.2 — job 聚合侧车：`shortlistFourDimV0.schemaVersion`。 */
export const SHORTLIST_FOUR_DIM_V0_SCHEMA = "shortlist_four_dim_v0" as const;
/**
 * Phase C v1.0 freeze — `longTermStability` uses 6 scene scores (incl. `future_planning_tradeoff`);
 * string `shortlist_four_dim_formula_v6` distinguishes audits/regressions from earlier five-mean formula.
 */
export const SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0 = "shortlist_four_dim_formula_v6" as const;
/** Phase C v0.3 — scene-level shortlist simulation evidence sidecar. */
export const SHORTLIST_SCENARIOS_V0_SCHEMA = "shortlist_scenarios_v0" as const;
/**
 * Phase C v1.0 freeze — fixed **10** scene keys for `shortlistScenariosV0` (count + array order are the audit contract).
 * Do not add/remove/reorder without updating `shortlist-scenarios-v0.spec.ts` / `shortlist-four-dim-v0.spec.ts`
 * and `FinalMatchPage.jsx` duplicate list.
 */
export const SHORTLIST_SCENE_KEYS_V0 = [
  "first_message_opening",
  "pace_negotiation",
  "boundary_conflict_response",
  "misunderstanding_repair",
  "long_term_lifestyle_alignment",
  "values_commitment_conflict",
  "re_engagement_after_lull",
  "emotional_support_under_stress",
  "friends_family_integration_boundary",
  "future_planning_tradeoff",
] as const;

/** §2.2 — single budget rule. */
export const SIMULATION_V1_MAX_CANDIDATES_PER_JOB = 8;

/** §3.5 — narrator allowed at most once; fixed at round index 2 (1-based round === 3). */
export const TRANSCRIPT_LITE_NARRATOR_ROUND = 3;

export const JOB_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
} as const;

/** Phase F v0.1 — read-time `jobAuditV0` payload; not persisted. */
export const JOB_AUDIT_V0_SCHEMA = "job_audit_v0" as const;

/**
 * Only these values are returned; no free-text diagnostic strings.
 * `none` = completed job with all three sidecar JSON columns present (normal).
 */
export const JOB_AUDIT_V0_SUPPRESSED_REASON = {
  NONE: "none",
  /** jobStatus is not `completed`; sidecar columns may be empty. */
  JOB_IN_PROGRESS: "job_in_progress",
  /** `tryBuildShortlistScenariosV0` returned null. */
  SCENARIOS_NOT_BUILDABLE: "scenarios_not_buildable",
  /** Scenarios built but `tryBuildShortlistFourDimV0` returned null. */
  FOUR_DIM_NOT_BUILDABLE: "four_dim_not_buildable",
  /** `tryBuildShortlistDecisionV0` returned null. */
  DECISION_NOT_BUILDABLE: "decision_not_buildable",
  /** Both fourDim and decision non-null but ranked lists differ. */
  RANK_MISMATCH: "rank_mismatch",
  /** Recompute would persist sidecars, but all three JSON columns are null. */
  PERSISTED_SIDECARS_STALE: "persisted_sidecars_stale",
  /** DB has three sidecar columns set but recompute disagrees; or other anomaly. */
  PERSISTED_SIDECARS_INCONSISTENT: "persisted_sidecars_inconsistent",
  UNKNOWN: "unknown",
} as const;

/** Data-shape based only (Phase F v0.5); no timestamp threshold. */
export const JOB_AUDIT_V0_SPEC_CLASSIFICATION = {
  LEGACY_PRE_SHORTLIST_CONTRACT: "legacy_pre_shortlist_contract",
  CURRENT_SHORTLIST_CONTRACT: "current_shortlist_contract",
  UNKNOWN: "unknown",
} as const;

/** Read-only triage bucket for internal diagnostics. */
export const JOB_AUDIT_V0_DIAGNOSTIC_BUCKET = {
  LEGACY_ACCEPTABLE: "legacy_acceptable",
  CURRENT_OK: "current_ok",
  CURRENT_ANOMALY: "current_anomaly",
  IN_PROGRESS: "in_progress",
} as const;

/** Single-value buildability detail; no free text, no multi-reason list. */
export const JOB_AUDIT_V0_BUILDABILITY_DETAIL = {
  NONE: "none",
  BINDING_MISSING: "binding_missing",
  BINDING_SHAPE_INVALID: "binding_shape_invalid",
  ITEMS_INCOMPLETE_OR_FAILED: "items_incomplete_or_failed",
  RANK_MISMATCH: "rank_mismatch",
  PERSISTED_SIDECARS_STALE: "persisted_sidecars_stale",
  PERSISTED_SIDECARS_INCONSISTENT: "persisted_sidecars_inconsistent",
  UNKNOWN: "unknown",
} as const;

export const ITEM_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;
