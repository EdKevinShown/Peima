/**
 * OpenAI-compatible chat completion for worker (same env + URL rules as API AiSimulationV1ChatClient).
 */
import { buildAiSimulationV1ChatCompletionsUrl } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";
import type {
  AiSimulationV1ChatResult,
} from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function readModel(): string {
  const v = process.env.AI_SIMULATION_V1_MODEL?.trim();
  if (v) return v;
  return (process.env.MATCH_REVIEW_AI_MODEL ?? "gpt-4o-mini").trim();
}

function readApiKey(): string {
  const v = process.env.AI_SIMULATION_V1_API_KEY?.trim();
  if (v) return v;
  return (process.env.MATCH_REVIEW_AI_API_KEY ?? "").trim();
}

function readBaseUrl(): string {
  const v = process.env.AI_SIMULATION_V1_BASE_URL?.trim();
  if (v) return v;
  return (process.env.MATCH_REVIEW_AI_BASE_URL ?? "").trim();
}

function readTimeoutMs(): number {
  const raw = parseInt(process.env.AI_SIMULATION_V1_TIMEOUT_MS ?? "60000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}

function readMaxTokens(): number {
  const raw = parseInt(process.env.AI_SIMULATION_V1_MAX_TOKENS ?? "8000", 10);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 128_000) {
    return 8000;
  }
  return Math.trunc(raw);
}

/** Same behavior as `AiSimulationV1ChatClient.complete` (no API key in logs). */
export async function completeAiSimulationChatFromEnv(
  system: string,
  user: string,
): Promise<AiSimulationV1ChatResult> {
  if (!truthyEnv(process.env.AI_SIMULATION_V1_ENABLED)) {
    return { ok: false, kind: "disabled" };
  }
  const apiKey = readApiKey();
  if (!apiKey) {
    return { ok: false, kind: "missing_api_key" };
  }

  const url = buildAiSimulationV1ChatCompletionsUrl(readBaseUrl());
  const body = {
    model: readModel(),
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    temperature: 0.25,
    max_tokens: readMaxTokens(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readTimeoutMs());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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
