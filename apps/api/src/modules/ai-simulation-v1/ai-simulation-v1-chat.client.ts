import { Injectable } from "@nestjs/common";
import { AiSimulationV1ConfigService } from "./ai-simulation-v1.config.service";
import { buildOpenAiCompatibleChatCompletionsUrl } from "../../common/ai/chat-completions-url";

/**
 * Resolves `AI_SIMULATION_V1_BASE_URL` / `MATCH_REVIEW_AI_BASE_URL` to a Chat Completions URL.
 * - DeepSeek: `https://api.deepseek.com` → `https://api.deepseek.com/chat/completions` (no `/v1/` segment).
 * - OpenAI-style: `https://api.openai.com/v1` → `https://api.openai.com/v1/chat/completions`.
 * If the base already ends with `/chat/completions`, it is returned unchanged (no duplicate path).
 */
export function buildAiSimulationV1ChatCompletionsUrl(baseUrl: string): string {
  return buildOpenAiCompatibleChatCompletionsUrl(baseUrl);
}

export type AiSimulationV1ChatFailureKind =
  | "disabled"
  | "missing_api_key"
  | "timeout"
  | "network"
  | "http"
  | "empty_content"
  | "invalid_json_response";

export type AiSimulationV1ChatResult =
  | { ok: true; content: string }
  | {
      ok: false;
      kind: AiSimulationV1ChatFailureKind;
      status?: number;
      detail?: string;
    };

@Injectable()
export class AiSimulationV1ChatClient {
  constructor(private readonly config: AiSimulationV1ConfigService) {}

  async complete(system: string, user: string): Promise<AiSimulationV1ChatResult> {
    if (!this.config.aiSimulationV1Enabled) {
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
      temperature: 0.25,
      max_tokens: this.config.maxCompletionTokens,
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
          detail = await res.text();
          if (detail && detail.length > 500) {
            detail = `${detail.slice(0, 500)}…`;
          }
        } catch {
          detail = undefined;
        }
        return {
          ok: false,
          kind: "http",
          status: res.status,
          detail,
        };
      }

      let json: {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      try {
        json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
      } catch (e) {
        return {
          ok: false,
          kind: "invalid_json_response",
          detail: e instanceof Error ? e.message : String(e),
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
        return { ok: false, kind: "timeout" };
      }
      return {
        ok: false,
        kind: "network",
        detail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
