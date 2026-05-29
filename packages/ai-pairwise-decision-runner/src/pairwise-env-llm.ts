import { buildAiSimulationV1ChatCompletionsUrl } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";
import type { AiPairwiseDecisionChatResult } from "../../../apps/api/src/modules/ai-pairwise-decision/ai-pairwise-decision-llm.client";

function truthyPairwiseEnabled(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function readBaseUrl(): string {
  return (process.env.AI_PAIRWISE_DECISION_BASE_URL ?? "https://api.deepseek.com").trim();
}

function readApiKey(): string {
  return (process.env.AI_PAIRWISE_DECISION_API_KEY ?? "").trim();
}

function readModel(): string {
  return (process.env.AI_PAIRWISE_DECISION_MODEL ?? "deepseek-v4-flash").trim() || "deepseek-v4-flash";
}

function readTimeoutMs(): number {
  const raw = parseInt(process.env.AI_PAIRWISE_DECISION_TIMEOUT_MS ?? "90000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
}

function readMaxTokens(): number {
  const raw = parseInt(process.env.AI_PAIRWISE_DECISION_MAX_TOKENS ?? "2500", 10);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 128_000) {
    return 2500;
  }
  return Math.trunc(raw);
}

function readJsonObjectMode(): boolean {
  return process.env.AI_PAIRWISE_DECISION_JSON_OBJECT_MODE?.trim() === "1";
}

const DETAIL_MAX = 400;

function truncateDetail(s: string): string {
  if (s.length <= DETAIL_MAX) return s;
  return `${s.slice(0, DETAIL_MAX)}…`;
}

/** Same behavior as `AiPairwiseDecisionLlmClient.completePairwiseDecisionPrompt` (no API key in logs). */
export async function completePairwiseDecisionPromptFromEnv(
  system: string,
  user: string,
): Promise<AiPairwiseDecisionChatResult> {
  if (!truthyPairwiseEnabled(process.env.AI_PAIRWISE_DECISION_ENABLED)) {
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
    temperature: 0.2,
    max_tokens: readMaxTokens(),
    ...(readJsonObjectMode() ? { response_format: { type: "json_object" as const } } : {}),
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
        const t = await res.text();
        detail = t ? truncateDetail(t) : undefined;
      } catch {
        detail = undefined;
      }
      console.warn(
        JSON.stringify({
          event: "pairwise_llm_http",
          ts: new Date().toISOString(),
          status: res.status,
          note: "body_truncated_no_key",
        }),
      );
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
      console.warn(JSON.stringify({ event: "pairwise_llm_timeout", ts: new Date().toISOString() }));
      return { ok: false, kind: "timeout" };
    }
    console.warn(
      JSON.stringify({
        event: "pairwise_llm_network",
        ts: new Date().toISOString(),
        err: truncateDetail(e instanceof Error ? e.message : String(e)),
      }),
    );
    return {
      ok: false,
      kind: "network",
      detail: truncateDetail(e instanceof Error ? e.message : String(e)),
    };
  } finally {
    clearTimeout(timeout);
  }
}
