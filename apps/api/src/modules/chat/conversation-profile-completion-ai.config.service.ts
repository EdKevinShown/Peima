import { Injectable } from "@nestjs/common";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** P6.8 profile-completion LLM：独立环境变量前缀，不与 Copilot 开关混用。 */
@Injectable()
export class ConversationProfileCompletionAiConfigService {
  get enabled(): boolean {
    return truthyEnv(process.env.PROFILE_COMPLETION_AI_ENABLED);
  }

  get model(): string {
    return (process.env.PROFILE_COMPLETION_AI_MODEL ?? "gpt-4o-mini").trim();
  }

  get apiKey(): string {
    return (process.env.PROFILE_COMPLETION_AI_API_KEY ?? "").trim();
  }

  get baseUrl(): string {
    const b = (process.env.PROFILE_COMPLETION_AI_BASE_URL ?? "").trim();
    if (b) {
      return b.replace(/\/+$/, "");
    }
    return "https://api.openai.com";
  }

  get timeoutMs(): number {
    const n = Number.parseInt(
      process.env.PROFILE_COMPLETION_AI_TIMEOUT_MS ?? "25000",
      10,
    );
    if (!Number.isFinite(n) || n <= 0) {
      return 25_000;
    }
    return Math.min(n, 120_000);
  }
}
