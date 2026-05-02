import type { AiPairwiseDecision } from "./ai-pairwise-decision.types";

/** M3.8-M2: failure detail for `generateAiPairwiseDecision` (no raw LLM / no key). */
export type GenerateAiPairwiseDecisionFailureDetail = {
  code:
    | "disabled"
    | "missing_api_key"
    | "llm_http_error"
    | "llm_timeout"
    | "llm_network"
    | "llm_empty_content"
    | "invalid_llm_json_response"
    | "json_extract_error"
    | "json_parse_error"
    | "schema_validation"
    | "binding_conflict"
    | "metadata_conflict";
  message: string;
  path?: string;
  reason?: string;
  expected?: string;
  actual?: string;
  httpStatus?: number;
};

export type GenerateAiPairwiseDecisionResult =
  | {
      ok: true;
      value: AiPairwiseDecision;
      rawMeta: {
        provider: string;
        model: string;
        sourceVersion: string;
        fallbackUsed: boolean;
      };
    }
  | { ok: false; failureDetail: GenerateAiPairwiseDecisionFailureDetail };
