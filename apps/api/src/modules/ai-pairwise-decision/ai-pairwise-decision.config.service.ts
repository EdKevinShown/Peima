import { Injectable } from "@nestjs/common";

function truthyPairwiseEnabled(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * M3.8-M2: RRM-lite pairwise LLM — **independent** from `AI_SIMULATION_V1_*` (no semantic reuse of those env keys).
 */
@Injectable()
export class AiPairwiseDecisionConfigService {
  get enabled(): boolean {
    return truthyPairwiseEnabled(process.env.AI_PAIRWISE_DECISION_ENABLED);
  }

  get provider(): string {
    return (process.env.AI_PAIRWISE_DECISION_PROVIDER ?? "deepseek").trim() || "deepseek";
  }

  get baseUrl(): string {
    return (process.env.AI_PAIRWISE_DECISION_BASE_URL ?? "https://api.deepseek.com").trim();
  }

  get apiKey(): string {
    return (process.env.AI_PAIRWISE_DECISION_API_KEY ?? "").trim();
  }

  get model(): string {
    return (process.env.AI_PAIRWISE_DECISION_MODEL ?? "deepseek-v4-flash").trim() || "deepseek-v4-flash";
  }

  get timeoutMs(): number {
    const raw = parseInt(process.env.AI_PAIRWISE_DECISION_TIMEOUT_MS ?? "90000", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
  }

  get maxTokens(): number {
    const raw = parseInt(process.env.AI_PAIRWISE_DECISION_MAX_TOKENS ?? "2500", 10);
    if (!Number.isFinite(raw) || raw <= 0 || raw > 128_000) return 2500;
    return Math.trunc(raw);
  }

  /** OpenAI-compatible `response_format: { type: \"json_object\" }` — not supported by all providers. */
  get jsonObjectMode(): boolean {
    return process.env.AI_PAIRWISE_DECISION_JSON_OBJECT_MODE?.trim() === "1";
  }
}
