import { Injectable } from "@nestjs/common";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function slugifyProvider(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || "unknown";
}

/**
 * When AI_PROVIDER is unset, infer a display slug from the API host so
 * DeepSeek/OpenAI paths don't all look like "openai". Custom gateways → openai_compatible.
 */
function inferProviderSlugFromHost(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.includes("deepseek")) {
      return "deepseek";
    }
    if (host.includes("openai")) {
      return "openai";
    }
    if (host.includes("anthropic")) {
      return "anthropic";
    }
    if (host.includes("azure") || host.includes("microsoft")) {
      return "azure_openai";
    }
  } catch {
    /* ignore */
  }
  return "openai_compatible";
}

/**
 * Copilot LLM 环境配置。`providerSlug` / host 推断语义见 docs/P6/P6.2-copilot-llm-runbook.md §4、§13。
 */
@Injectable()
export class CopilotAiConfigService {
  get copilotEnabled(): boolean {
    return truthyEnv(process.env.AI_COPILOT_ENABLED);
  }

  /**
   * Vendor slug for `sourceType = model_<slug>`.
   * Prefer explicit AI_PROVIDER; else infer from AI_BASE_URL host; never mislabel a generic gateway as "openai".
   */
  get providerSlug(): string {
    const explicit = process.env.AI_PROVIDER?.trim();
    if (explicit) {
      return slugifyProvider(explicit);
    }
    return inferProviderSlugFromHost(this.baseUrl);
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
