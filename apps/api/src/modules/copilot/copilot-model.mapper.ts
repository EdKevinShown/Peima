import type { CopilotInsightsResponse } from "./dto/copilot-response.dto";

const MAX_STATE_LEN = 64;
const MAX_ITEM_LEN = 500;
const MAX_ADVICE = 6;
const MAX_RISKS = 4;
const MAX_TOPICS = 4;

function dedupeCap(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

function isValidState(s: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(s);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") {
      continue;
    }
    const t = x.trim().slice(0, MAX_ITEM_LEN);
    if (t) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Parse model output into insights partial; returns null if invalid.
 */
export function mapModelJsonToInsights(
  conversationId: string,
  rawContent: string,
): Pick<
  CopilotInsightsResponse,
  | "relationshipState"
  | "communicationAdvice"
  | "riskHints"
  | "suggestedTopics"
> | null {
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

  const relRaw =
    typeof o.relationshipState === "string" ? o.relationshipState.trim() : "";
  const rel = relRaw.toLowerCase().slice(0, MAX_STATE_LEN);
  if (!rel || !isValidState(rel)) {
    return null;
  }

  const communicationAdvice = dedupeCap(asStringArray(o.communicationAdvice), MAX_ADVICE);
  const riskHints = dedupeCap(asStringArray(o.riskHints), MAX_RISKS);
  const suggestedTopics = dedupeCap(asStringArray(o.suggestedTopics), MAX_TOPICS);

  if (communicationAdvice.length === 0) {
    return null;
  }
  if (riskHints.length === 0) {
    return null;
  }
  if (suggestedTopics.length === 0) {
    return null;
  }

  if (o.conversationId !== undefined) {
    if (o.conversationId !== conversationId) {
      return null;
    }
  }

  return {
    relationshipState: rel,
    communicationAdvice,
    riskHints,
    suggestedTopics,
  };
}
