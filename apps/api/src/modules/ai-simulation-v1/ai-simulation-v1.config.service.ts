import { Injectable } from "@nestjs/common";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * AI 模拟 v1 — env gate `AI_SIMULATION_V1_ENABLED`；LLM 默认复用 Match Review 的 baseUrl/key/model，可被 `AI_SIMULATION_V1_*` 覆盖。
 *
 * `baseUrl` 应为「根」或含版本前缀的根（无尾斜杠）：例如 DeepSeek `https://api.deepseek.com`，
 * OpenAI `https://api.openai.com/v1`。`AiSimulationV1ChatClient` 会追加 `/chat/completions`。
 */
@Injectable()
export class AiSimulationV1ConfigService {
  get aiSimulationV1Enabled(): boolean {
    return truthyEnv(process.env.AI_SIMULATION_V1_ENABLED);
  }

  get model(): string {
    const v = process.env.AI_SIMULATION_V1_MODEL?.trim();
    if (v) return v;
    return (process.env.MATCH_REVIEW_AI_MODEL ?? "gpt-4o-mini").trim();
  }

  get apiKey(): string {
    const v = process.env.AI_SIMULATION_V1_API_KEY?.trim();
    if (v) return v;
    return (process.env.MATCH_REVIEW_AI_API_KEY ?? "").trim();
  }

  get baseUrl(): string {
    const v = process.env.AI_SIMULATION_V1_BASE_URL?.trim();
    if (v) return v;
    return (process.env.MATCH_REVIEW_AI_BASE_URL ?? "").trim();
  }

  get timeoutMs(): number {
    const raw = parseInt(process.env.AI_SIMULATION_V1_TIMEOUT_MS ?? "60000", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
  }

  /** Chat Completions `max_tokens`; unset or invalid → 8000. */
  get maxCompletionTokens(): number {
    const raw = parseInt(process.env.AI_SIMULATION_V1_MAX_TOKENS ?? "8000", 10);
    if (!Number.isFinite(raw) || raw <= 0 || raw > 128_000) {
      return 8000;
    }
    return Math.trunc(raw);
  }
}
