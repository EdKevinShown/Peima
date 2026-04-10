import { Injectable } from "@nestjs/common";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

@Injectable()
export class CopilotAiConfigService {
  get copilotEnabled(): boolean {
    return truthyEnv(process.env.AI_COPILOT_ENABLED);
  }

  /** Lowercase provider id for `model_${provider}` (alphanumeric + underscore). */
  get providerSlug(): string {
    const raw = (process.env.AI_PROVIDER ?? "openai").trim().toLowerCase();
    const slug = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return slug || "unknown";
  }

  get model(): string {
    return (process.env.AI_MODEL ?? "gpt-4o-mini").trim();
  }

  get apiKey(): string {
    return (process.env.AI_API_KEY ?? "").trim();
  }

  /** OpenAI-compatible API root (no trailing slash). */
  get baseUrl(): string {
    const b = (process.env.AI_BASE_URL ?? "").trim();
    if (b) {
      return b.replace(/\/+$/, "");
    }
    return "https://api.openai.com";
  }

  get timeoutMs(): number {
    const n = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "25000", 10);
    if (!Number.isFinite(n) || n <= 0) {
      return 25_000;
    }
    return Math.min(n, 120_000);
  }
}
