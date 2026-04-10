const MAX_SUMMARY_LEN = 4000;
const MAX_HINT_LEN = 2000;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

export type SummaryModelPayload = {
  summary: string;
  chatStageHint: string;
};

/**
 * Parse model JSON; returns null if invalid or conversationId mismatch.
 */
export function mapModelJsonToSummary(
  conversationId: string,
  rawContent: string,
): SummaryModelPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawContent));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const o = parsed as Record<string, unknown>;

  if (typeof o.conversationId !== "string" || o.conversationId !== conversationId) {
    return null;
  }

  const summary =
    typeof o.summary === "string" ? o.summary.trim().slice(0, MAX_SUMMARY_LEN) : "";
  const chatStageHint =
    typeof o.chatStageHint === "string"
      ? o.chatStageHint.trim().slice(0, MAX_HINT_LEN)
      : "";

  if (!summary || !chatStageHint) {
    return null;
  }

  return { summary, chatStageHint };
}
