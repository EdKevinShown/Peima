import { AI_PAIRWISE_DECISION_SOURCE_VERSION } from "./ai-pairwise-decision.schema";
import type { RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";
import { normalizeAiPairwiseDecisionDraftFromShortlist } from "./ai-pairwise-decision-normalize-draft";
import { parseAndValidateAiPairwiseDecision } from "./ai-pairwise-decision.validate";
import { extractJsonObjectFromText } from "./ai-pairwise-decision-json-extract";
import {
  buildRrmLitePairwiseDecisionSystemPrompt,
  buildRrmLitePairwiseDecisionUserMessage,
} from "./ai-pairwise-decision.prompt";
import type { AiPairwiseDecisionChatResult } from "./ai-pairwise-decision-llm.client";
import type { GenerateAiPairwiseDecisionFailureDetail, GenerateAiPairwiseDecisionResult } from "./ai-pairwise-decision-generate.contracts";

export type PairwiseDecisionGeneratePorts = {
  enabled: boolean;
  apiKey: string;
  provider: string;
  model: string;
  complete: (system: string, user: string) => Promise<AiPairwiseDecisionChatResult>;
};

function mapChatFailure(chat: Extract<AiPairwiseDecisionChatResult, { ok: false }>): GenerateAiPairwiseDecisionResult {
  switch (chat.kind) {
    case "disabled":
      return {
        ok: false,
        failureDetail: { code: "disabled", message: "Pairwise LLM disabled at client layer." },
      };
    case "missing_api_key":
      return {
        ok: false,
        failureDetail: {
          code: "missing_api_key",
          message: "API key missing at client layer.",
        },
      };
    case "http":
      return {
        ok: false,
        failureDetail: {
          code: "llm_http_error",
          message: "Chat completions HTTP error.",
          httpStatus: chat.status,
          reason: chat.detail?.slice(0, 200),
        },
      };
    case "timeout":
      return {
        ok: false,
        failureDetail: { code: "llm_timeout", message: "Chat completions request timed out." },
      };
    case "network":
      return {
        ok: false,
        failureDetail: {
          code: "llm_network",
          message: "Network error calling chat completions.",
          reason: chat.detail?.slice(0, 200),
        },
      };
    case "empty_content":
      return {
        ok: false,
        failureDetail: {
          code: "llm_empty_content",
          message: "Model returned empty message content.",
        },
      };
    case "invalid_json_response":
      return {
        ok: false,
        failureDetail: {
          code: "invalid_llm_json_response",
          message: "HTTP body was not valid JSON for chat completions response.",
          reason: chat.detail?.slice(0, 200),
        },
      };
    default:
      return {
        ok: false,
        failureDetail: {
          code: "llm_network",
          message: "Unknown LLM client failure.",
        },
      };
  }
}

/**
 * M3.8-M4A + M15A: shared LLM → extract JSON → parse → **shortlist normalization** → validate (Nest service + worker env client).
 */
export async function generateAiPairwiseDecisionCore(
  ports: PairwiseDecisionGeneratePorts,
  shortlist: RelationshipShortlistTop2,
): Promise<GenerateAiPairwiseDecisionResult> {
  if (!ports.enabled) {
    return {
      ok: false,
      failureDetail: {
        code: "disabled",
        message: "AI_PAIRWISE_DECISION_ENABLED is not set to 1; skipping LLM.",
      },
    };
  }
  if (!ports.apiKey) {
    return {
      ok: false,
      failureDetail: {
        code: "missing_api_key",
        message: "AI_PAIRWISE_DECISION_API_KEY is missing or empty.",
      },
    };
  }

  const system = buildRrmLitePairwiseDecisionSystemPrompt();
  const user = buildRrmLitePairwiseDecisionUserMessage(shortlist);

  const chat = await ports.complete(system, user);
  if (!chat.ok) {
    return mapChatFailure(chat);
  }

  const extracted = extractJsonObjectFromText(chat.content);
  if (!extracted.ok) {
    return {
      ok: false,
      failureDetail: {
        code: "json_extract_error",
        message: "Could not extract a JSON object from model output.",
        reason: extracted.reason,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.jsonText) as unknown;
  } catch (e) {
    return {
      ok: false,
      failureDetail: {
        code: "json_parse_error",
        message: "Extracted slice is not valid JSON.",
        reason: e instanceof Error ? e.message.slice(0, 200) : "parse_error",
      },
    };
  }

  const normalized = normalizeAiPairwiseDecisionDraftFromShortlist(parsed, shortlist);
  if (!normalized.ok) {
    const f = normalized.failure;
    return {
      ok: false,
      failureDetail: {
        code: f.code,
        message: f.message,
        path: f.path,
        reason: f.reason,
        expected: f.expected,
        actual: f.actual,
      },
    };
  }

  const validated = parseAndValidateAiPairwiseDecision(normalized.draft);
  if (!validated.ok) {
    const d = validated.failureDetail;
    return {
      ok: false,
      failureDetail: {
        code: "schema_validation",
        message: "AiPairwiseDecision schema validation failed.",
        path: d.path,
        reason: d.reason,
        expected: d.expected,
        actual: d.actual,
      },
    };
  }

  const value = validated.value;

  return {
    ok: true,
    value,
    rawMeta: {
      provider: ports.provider,
      model: ports.model,
      sourceVersion: AI_PAIRWISE_DECISION_SOURCE_VERSION,
      fallbackUsed: value.fallbackUsed,
    },
  };
}
