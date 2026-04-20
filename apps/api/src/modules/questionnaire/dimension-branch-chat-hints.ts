import type { Prisma } from "@peima/database";
import type { BranchOpportunityRow, BranchScoreRow } from "./questionnaire.scorer";
import { P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND } from "./dimension-branch-chat-hints.constants";

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"] as const;

/** Extra hit count per accepted chat hint branch (supplement only; questionnaire hits unchanged at source). */
export const QUESTIONNAIRE_CHAT_HINT_HIT_SUPPLEMENT = 1 as const;

export type DimensionBranchChatHintItem = {
  axisId: number;
  branch: string;
};

/**
 * Deep-clone questionnaire-derived hits and add supplementary hits for chat hints.
 * Skips invalid (axis, branch) pairs where opportunities for that branch are 0 (unknown branch for axis).
 */
export function mergeQuestionnaireHitsWithChatHintSupplements(
  questionnaireHits: Record<number, BranchScoreRow>,
  chatHints: ReadonlyArray<DimensionBranchChatHintItem> | undefined,
  opportunities: Record<number, BranchOpportunityRow>,
): Record<number, BranchScoreRow> {
  const out: Record<number, BranchScoreRow> = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    const src = questionnaireHits[axis] ?? {};
    const row: BranchScoreRow = {};
    for (const b of BRANCH_LETTERS) {
      row[b] = src[b] ?? 0;
    }
    out[axis] = row;
  }

  if (!chatHints?.length) {
    return out;
  }

  for (const hint of chatHints) {
    const { axisId, branch } = hint;
    if (axisId < 1 || axisId > 20) continue;
    if (!BRANCH_LETTERS.includes(branch as (typeof BRANCH_LETTERS)[number])) {
      continue;
    }
    const letter = branch as (typeof BRANCH_LETTERS)[number];
    const o = opportunities[axisId]?.[letter] ?? 0;
    if (o <= 0) continue;
    const row = out[axisId];
    if (!row) continue;
    row[letter] = (row[letter] ?? 0) + QUESTIONNAIRE_CHAT_HINT_HIT_SUPPLEMENT;
  }

  return out;
}

function parseHintItemsArray(raw: unknown): DimensionBranchChatHintItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DimensionBranchChatHintItem[] = [];
  for (const el of raw) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) return null;
    const o = el as Record<string, unknown>;
    if (typeof o.axisId !== "number" || !Number.isInteger(o.axisId)) return null;
    if (typeof o.branch !== "string") return null;
    out.push({ axisId: o.axisId, branch: o.branch });
  }
  return out;
}

/**
 * Reads persisted accepted hints for layer1 merge. Malformed or wrong `kind` → no hints (safe default).
 */
export function parseDimensionBranchChatHintsFromUserProfileJson(
  json: unknown,
): ReadonlyArray<DimensionBranchChatHintItem> | undefined {
  if (json == null) return undefined;
  if (typeof json !== "object" || Array.isArray(json)) return undefined;
  const root = json as Record<string, unknown>;
  if (root.kind !== P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND) return undefined;
  const items = parseHintItemsArray(root.items);
  if (!items) return undefined;
  const sane = items.filter(
    (it) =>
      it.axisId >= 1 &&
      it.axisId <= 20 &&
      BRANCH_LETTERS.includes(it.branch as (typeof BRANCH_LETTERS)[number]),
  );
  if (sane.length > 3) return undefined;
  const axes = new Set(sane.map((i) => i.axisId));
  if (axes.size !== sane.length) return undefined;
  return sane;
}

export type MergePersistedDimensionBranchChatHintsResult =
  | { ok: true; json: Prisma.InputJsonValue }
  | { ok: false; reason: "too_many_axes" };

/**
 * Merges newly accepted items into stored envelope (overwrite by `axisId`). At most 3 distinct axes total.
 */
export function mergePersistedDimensionBranchChatHintsJson(
  existing: unknown,
  incoming: ReadonlyArray<DimensionBranchChatHintItem>,
): MergePersistedDimensionBranchChatHintsResult {
  const prior = parseDimensionBranchChatHintsFromUserProfileJson(existing) ?? [];
  const byAxis = new Map<number, string>();
  for (const it of prior) {
    byAxis.set(it.axisId, it.branch);
  }
  for (const it of incoming) {
    byAxis.set(it.axisId, it.branch);
  }
  if (byAxis.size > 3) {
    return { ok: false, reason: "too_many_axes" };
  }
  const items = [...byAxis.entries()]
    .map(([axisId, branch]) => ({ axisId, branch }))
    .sort((a, b) => a.axisId - b.axisId);
  return {
    ok: true,
    json: {
      kind: P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
      schemaVersion: 1,
      items,
    },
  };
}
