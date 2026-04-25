import type {
  AiMatchReview,
  AiMatchReviewBand,
  AiMatchReviewConfidence,
  AiMatchReviewRecommendation,
} from "./match-review-ai.types";

const MAX_STR_LEN = 600;
const MAX_LIST = 8;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

function isBand(x: unknown): x is AiMatchReviewBand {
  return x === "high" || x === "medium" || x === "low";
}

function isRec(x: unknown): x is AiMatchReviewRecommendation {
  return (
    x === "strong_match" ||
    x === "match" ||
    x === "cautious_match" ||
    x === "not_recommended"
  );
}

function isConf(x: unknown): x is AiMatchReviewConfidence {
  return x === "high" || x === "medium" || x === "low";
}

function clampStr(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function asStringArray(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const item of x) {
    if (typeof item !== "string" || !item.trim()) return null;
    out.push(clampStr(item, MAX_STR_LEN));
    if (out.length >= MAX_LIST) break;
  }
  return out.length ? out : null;
}

export function mapModelJsonToAiMatchReview(rawContent: string): AiMatchReview | null {
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

  const finalScore =
    typeof o.finalScore === "number" && Number.isFinite(o.finalScore)
      ? Math.min(100, Math.max(0, o.finalScore))
      : null;
  if (finalScore === null) {
    return null;
  }

  if (!isRec(o.recommendation)) return null;
  if (!isBand(o.conversationPotential)) return null;
  if (!isBand(o.longTermPotential)) return null;
  if (!isConf(o.confidence)) return null;

  const strengths = asStringArray(o.strengths);
  const risks = asStringArray(o.risks);
  if (!strengths || !risks) return null;

  const explanation =
    typeof o.explanation === "string" && o.explanation.trim()
      ? clampStr(o.explanation, 4000)
      : "";

  if (!explanation) {
    return null;
  }

  return {
    finalScore,
    recommendation: o.recommendation,
    conversationPotential: o.conversationPotential,
    longTermPotential: o.longTermPotential,
    strengths,
    risks,
    explanation,
    confidence: o.confidence,
  };
}
