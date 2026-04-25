import type {
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  AI_SIMULATION_RUN_SPEC_V1,
} from "./ai-simulation-v1.constants";

export type AiSimulationV1EnqueueDto = {
  schemaVersion: typeof AI_SIMULATION_V1_SCHEMA;
  viewerUserId: string;
  hintSource: typeof AI_SIMULATION_V1_HINT_SOURCE;
  poolId: string;
  hintSnapshot: unknown;
  runSpecVersion: typeof AI_SIMULATION_RUN_SPEC_V1;
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
