import type {
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  AI_SIMULATION_RUN_SPEC_V1,
  JOB_AUDIT_V0_BUILDABILITY_DETAIL,
  JOB_AUDIT_V0_DIAGNOSTIC_BUCKET,
  JOB_AUDIT_V0_SCHEMA,
  JOB_AUDIT_V0_SPEC_CLASSIFICATION,
  JOB_AUDIT_V0_SUPPRESSED_REASON,
  SHORTLIST_DECISION_V0_SCHEMA,
  SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0,
  SHORTLIST_SCENARIOS_V0_SCHEMA,
  SHORTLIST_SCENE_KEYS_V0,
  SHORTLIST_FOUR_DIM_V0_SCHEMA,
} from "./ai-simulation-v1.constants";

/** Phase C v0 — persisted on `AiSimulationV1Job.shortlistBinding`; must match `hintSnapshot` queue. */
export type ShortlistContractBindingV0 = {
  previewPoolId: string;
  shortlistSchemaVersion: string;
  shortlistCandidateUserIds: string[];
  shortlistFingerprint: string;
};

export type AiSimulationV1EnqueueDto = {
  schemaVersion: typeof AI_SIMULATION_V1_SCHEMA;
  viewerUserId: string;
  hintSource: typeof AI_SIMULATION_V1_HINT_SOURCE;
  poolId: string;
  hintSnapshot: unknown;
  runSpecVersion: typeof AI_SIMULATION_RUN_SPEC_V1;
  shortlistBinding: ShortlistContractBindingV0;
};

export type AiSimulationItemErrorCode =
  | "timeout"
  | "http_error"
  | "invalid_json"
  | "schema_validation"
  | "disabled"
  | "missing_api_key"
  | "empty_content"
  | "network";

export type TranscriptLiteRoundV1 = {
  round: number;
  speaker: "viewer" | "candidate" | "narrator";
  intent_tag: string;
  text: string;
};

export type TranscriptLiteV1 = {
  schemaVersion: "transcript_lite_v1";
  rounds: TranscriptLiteRoundV1[];
};

export type EvaluatorV1 = {
  continue_recommendation: "explore_more" | "hold" | "slow_down";
  risk_tags: string[];
  mitigation_hints: string[];
  simulationRankScore: number;
  confidence: "high" | "medium" | "low";
};

/** Phase C 第二步 — 持久化在 `AiSimulationV1Job.shortlistDecisionV0`；只读侧车。 */
export type ShortlistDecisionV0 = {
  schemaVersion: typeof SHORTLIST_DECISION_V0_SCHEMA;
  chosenCandidateUserId: string;
  rankedCandidateUserIds: string[];
  /** 必须与 enqueue 时 `shortlistBinding.shortlistFingerprint` 一致。 */
  shortlistFingerprint: string;
  /** 来自决胜候选人 `evaluator.confidence`（可选）。 */
  confidenceTier?: EvaluatorV1["confidence"];
};

export type ShortlistFourDimCandidateV0 = {
  candidateUserId: string;
  openingSmoothness: number;
  continuation: number;
  conflictRisk: number;
  longTermStability: number;
};

/** Phase C v0.2 — fixed 4-dim comparison basis for shortlist-only AI decision sidecar. */
export type ShortlistFourDimV0 = {
  schemaVersion: typeof SHORTLIST_FOUR_DIM_V0_SCHEMA;
  shortlistFingerprint: string;
  rankingFormulaVersion: typeof SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0;
  candidateDimensions: ShortlistFourDimCandidateV0[];
  comparison: {
    rankedCandidateUserIds: string[];
  };
};

export type ShortlistSceneKeyV0 = (typeof SHORTLIST_SCENE_KEYS_V0)[number];

export type ShortlistScenarioRowV0 = {
  sceneKey: ShortlistSceneKeyV0;
  candidateUserId: string;
  score: number;
  status: "succeeded" | "failed";
  /** Fixed short explanation phrase for this scene score. */
  reason: string;
  /** Fixed risk label/phrase (controlled vocabulary, not free text). */
  riskPoint: string;
  /** Fixed short evidence template snippet for quick auditing. */
  evidenceSnippet: string;
  /** Mark explanation completeness only; does not affect ranking computation. */
  reviewStatus: "reviewable" | "unreviewable";
};

export type ShortlistScenariosV0 = {
  schemaVersion: typeof SHORTLIST_SCENARIOS_V0_SCHEMA;
  shortlistFingerprint: string;
  scenes: ShortlistScenarioRowV0[];
};

export type AiSimulationLlmPayloadV1 = {
  schemaVersion: "ai_simulation_llm_payload_v1";
  transcript_lite: TranscriptLiteV1;
  evaluator: EvaluatorV1;
};

export type SimulationHintSnapshotEntry = {
  rankHint: number;
  candidateUserId: string;
  bucket: "promote" | "neutral" | "demote";
  prescreenScore: number;
};

export type JobAuditV0SuppressedReason =
  (typeof JOB_AUDIT_V0_SUPPRESSED_REASON)[keyof typeof JOB_AUDIT_V0_SUPPRESSED_REASON];
export type JobAuditV0SpecClassification =
  (typeof JOB_AUDIT_V0_SPEC_CLASSIFICATION)[keyof typeof JOB_AUDIT_V0_SPEC_CLASSIFICATION];
export type JobAuditV0DiagnosticBucket =
  (typeof JOB_AUDIT_V0_DIAGNOSTIC_BUCKET)[keyof typeof JOB_AUDIT_V0_DIAGNOSTIC_BUCKET];
export type JobAuditV0BuildabilityDetail =
  (typeof JOB_AUDIT_V0_BUILDABILITY_DETAIL)[keyof typeof JOB_AUDIT_V0_BUILDABILITY_DETAIL];

export type JobAuditV0ItemCounts = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
};

/** Read-time only; returned on admin/viewer `GET .../jobs/:id` (Phase F v0.1). */
export type JobAuditV0 = {
  schemaVersion: typeof JOB_AUDIT_V0_SCHEMA;
  jobStatus: string;
  shortlistBindingPresent: boolean;
  /** True iff all three sidecar JSON columns are non-null on the job row. */
  sidecarTrioPresent: boolean;
  itemCounts: JobAuditV0ItemCounts;
  /**
   * Whether fourDim and decision ranked lists match, from on-the-fly recompute.
   * `null` when job is not `completed` (in progress).
   */
  rankConsistent: boolean | null;
  sidecarSuppressedReason: JobAuditV0SuppressedReason;
  /** legacy vs current-spec by data shape only (Phase F v0.5). */
  specClassification: JobAuditV0SpecClassification;
  /** high-level internal triage bucket. */
  diagnosticBucket: JobAuditV0DiagnosticBucket;
  /** single-value buildability detail, fixed enum only. */
  buildabilityDetail: JobAuditV0BuildabilityDetail;
};
