import { Injectable, Logger } from "@nestjs/common";
import { buildAiSimulationV1ChatCompletionsUrl } from "../ai-simulation-v1/ai-simulation-v1-chat.client";
import { AiPairwiseDecisionConfigService } from "./ai-pairwise-decision.config.service";

export type AiPairwiseDecisionChatFailureKind =
  | "disabled"
  | "missing_api_key"
  | "timeout"
  | "network"
  | "http"
  | "empty_content"
  | "invalid_json_response";

export type AiPairwiseDecisionChatResult =
  | { ok: true; content: string }
  | {
      ok: false;
      kind: AiPairwiseDecisionChatFailureKind;
      status?: number;
      /** Truncated / safe; never API key. */
      detail?: string;
    };

const DETAIL_MAX = 400;

function truncateDetail(s: string): string {
  if (s.length <= DETAIL_MAX) return s;
  return `${s.slice(0, DETAIL_MAX)}…`;
}

@Injectable()
export class AiPairwiseDecisionLlmClient {
  private readonly logger = new Logger(AiPairwiseDecisionLlmClient.name);

  constructor(private readonly config: AiPairwiseDecisionConfigService) {}

  /**
   * OpenAI-compatible chat completions (DeepSeek-compatible). Does not throw.
   */
  async completePairwiseDecisionPrompt(system: string, user: string): Promise<AiPairwiseDecisionChatResult> {
    if (!this.config.enabled) {
      return { ok: false, kind: "disabled" };
    }
    if (!this.config.apiKey) {
      return { ok: false, kind: "missing_api_key" };
    }

    const url = buildAiSimulationV1ChatCompletionsUrl(this.config.baseUrl);
    const body = {
      model: this.config.model,
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ],
      temperature: 0.2,
      max_tokens: this.config.maxTokens,
      ...(this.config.jsonObjectMode ? { response_format: { type: "json_object" as const } } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail: string | undefined;
        try {
          const t = await res.text();
          detail = t ? truncateDetail(t) : undefined;
        } catch {
          detail = undefined;
        }
        this.logger.warn(`pairwise_llm_http status=${res.status} (body truncated, no key logged)`);
        return {
          ok: false,
          kind: "http",
          status: res.status,
          detail,
        };
      }

      let json: { choices?: Array<{ message?: { content?: string | null } }> };
      try {
        json = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
      } catch (e) {
        return {
          ok: false,
          kind: "invalid_json_response",
          detail: truncateDetail(e instanceof Error ? e.message : String(e)),
        };
      }
      const content = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
        return { ok: false, kind: "empty_content" };
      }
      return { ok: true, content };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") {
        this.logger.warn("pairwise_llm_timeout");
        return { ok: false, kind: "timeout" };
      }
      this.logger.warn(`pairwise_llm_network err=${truncateDetail(e instanceof Error ? e.message : String(e))}`);
      return {
        ok: false,
        kind: "network",
        detail: truncateDetail(e instanceof Error ? e.message : String(e)),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
