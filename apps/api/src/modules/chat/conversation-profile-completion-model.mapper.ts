import type { DimensionBranchChatHintItem } from "../questionnaire/dimension-branch-chat-hints";

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"] as const;
const ALLOWED_TOP = new Set(["schemaVersion", "items"]);
const ALLOWED_ITEM_KEYS = new Set([
  "axisId",
  "branch",
  "confidence",
  "evidence",
]);
const MAX_EVIDENCE_LEN = 200;
const EXPECTED_SCHEMA_VERSION = 1;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return t;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Parses model JSON into minimal hint items (axisId + branch only). Returns null if invalid / empty after rules.
 */
export function mapModelJsonToProfileCompletionDimensionHints(
  rawContent: string,
): DimensionBranchChatHintItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawContent));
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) {
    return null;
  }
  for (const k of Object.keys(parsed)) {
    if (!ALLOWED_TOP.has(k)) {
      return null;
    }
  }
  if (parsed.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    return null;
  }
  if (!Array.isArray(parsed.items)) {
    return null;
  }
  if (parsed.items.length === 0 || parsed.items.length > 3) {
    return null;
  }

  const out: DimensionBranchChatHintItem[] = [];
  const seenAxis = new Set<number>();

  for (const el of parsed.items) {
    if (!isPlainObject(el)) {
      return null;
    }
    for (const k of Object.keys(el)) {
      if (!ALLOWED_ITEM_KEYS.has(k)) {
        return null;
      }
    }
    if (typeof el.axisId !== "number" || !Number.isInteger(el.axisId)) {
      return null;
    }
    if (typeof el.branch !== "string") {
      return null;
    }
    const branch = el.branch.trim().toUpperCase();
    if (!BRANCH_LETTERS.includes(branch as (typeof BRANCH_LETTERS)[number])) {
      return null;
    }
    if (el.axisId < 1 || el.axisId > 20) {
      return null;
    }
    if (seenAxis.has(el.axisId)) {
      return null;
    }
    seenAxis.add(el.axisId);

    if (el.confidence !== undefined) {
      if (typeof el.confidence !== "number" || !Number.isFinite(el.confidence)) {
        return null;
      }
      if (el.confidence < 0 || el.confidence > 1) {
        return null;
      }
    }
    if (el.evidence !== undefined) {
      if (typeof el.evidence !== "string") {
        return null;
      }
      if (el.evidence.length > MAX_EVIDENCE_LEN) {
        return null;
      }
    }

    out.push({ axisId: el.axisId, branch });
  }

  return out.length ? out : null;
}
