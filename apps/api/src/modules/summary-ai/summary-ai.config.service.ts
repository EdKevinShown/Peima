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
 * P6.5 Summary AI — env only; independent from Copilot `AI_*`.
 * See docs/P6/P6.5-summary-ai-slice.md.
 */
@Injectable()
export class SummaryAiConfigService {
  get summaryAiEnabled(): boolean {
    return truthyEnv(process.env.SUMMARY_AI_ENABLED);
  }

  get providerSlug(): string {
    const explicit = process.env.SUMMARY_AI_PROVIDER?.trim();
    if (explicit) {
      return slugifyProvider(explicit);
    }
    return inferProviderSlugFromHost(this.baseUrl);
  }

  get model(): string {
    return (process.env.SUMMARY_AI_MODEL ?? "gpt-4o-mini").trim();
  }

  get apiKey(): string {
    return (process.env.SUMMARY_AI_API_KEY ?? "").trim();
  }

  get baseUrl(): string {
    const b = (process.env.SUMMARY_AI_BASE_URL ?? "").trim();
    if (b) {
      return b.replace(/\/+$/, "");
    }
    return "https://api.openai.com";
  }

  get timeoutMs(): number {
    const n = Number.parseInt(process.env.SUMMARY_AI_TIMEOUT_MS ?? "25000", 10);
    if (!Number.isFinite(n) || n <= 0) {
      return 25_000;
    }
    return Math.min(n, 120_000);
  }
}
