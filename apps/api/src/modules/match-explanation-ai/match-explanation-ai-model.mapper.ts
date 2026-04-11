const MAX_EXPLANATION_LEN = 8000;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

export type MatchExplanationModelPayload = {
  explanationText: string;
};

export function mapModelJsonToMatchExplanation(
  matchResultId: string,
  rawContent: string,
): MatchExplanationModelPayload | null {
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

  if (typeof o.matchResultId !== "string" || o.matchResultId !== matchResultId) {
    return null;
  }

  const explanationText =
    typeof o.explanationText === "string"
      ? o.explanationText.trim().slice(0, MAX_EXPLANATION_LEN)
      : "";

  if (!explanationText) {
    return null;
  }

  return { explanationText };
}
