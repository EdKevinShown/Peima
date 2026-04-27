import { UnprocessableEntityException } from "@nestjs/common";
import type { DimensionBranchChatHintItem } from "../questionnaire/dimension-branch-chat-hints";
import {
  P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
  isP6DimensionBranchHintsSourceVersion,
} from "../questionnaire/dimension-branch-chat-hints.constants";
import {
  computeBranchOpportunitiesFromQuestionBank,
  type BranchOpportunityRow,
} from "../questionnaire/questionnaire.scorer";

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** P6.8 hints accept path vs legacy float {@link parseProfileProposedPatch}. */
export function isDimensionBranchHintsAcceptPayload(row: {
  sourceVersion: string | null;
  proposedPatch: unknown;
}): boolean {
  if (!isPlainObject(row.proposedPatch)) return false;
  if (row.proposedPatch.kind === P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND) {
    return true;
  }
  return isP6DimensionBranchHintsSourceVersion(row.sourceVersion);
}

/**
 * P6.8.x：按题库 `computeBranchOpportunitiesFromQuestionBank` 丢弃无 opportunities 的 axis-branch；
 * 保留首次出现的合法轴（同轴多条时只保留第一条合法项）。供 profile-completion 生成链在 parse 前收口。
 */
export function filterDimensionBranchHintsToQuestionBank(
  items: ReadonlyArray<DimensionBranchChatHintItem>,
): DimensionBranchChatHintItem[] {
  const opps = computeBranchOpportunitiesFromQuestionBank();
  const out: DimensionBranchChatHintItem[] = [];
  const seenAxis = new Set<number>();
  for (const it of items) {
    const { axisId, branch } = it;
    if (axisId < 1 || axisId > 20) continue;
    if (!BRANCH_LETTERS.includes(branch as (typeof BRANCH_LETTERS)[number])) {
      continue;
    }
    const letter = branch as (typeof BRANCH_LETTERS)[number];
    const o = opps[axisId]?.[letter] ?? 0;
    if (o <= 0) continue;
    if (seenAxis.has(axisId)) continue;
    seenAxis.add(axisId);
    out.push({ axisId, branch: letter });
  }
  return out;
}

function validateItemsAgainstBank(
  items: ReadonlyArray<DimensionBranchChatHintItem>,
  opps: Record<number, BranchOpportunityRow>,
): void {
  const seenAxis = new Set<number>();
  for (const it of items) {
    const { axisId, branch } = it;
    if (axisId < 1 || axisId > 20) {
      throw new UnprocessableEntityException("hint axisId must be 1–20");
    }
    if (!BRANCH_LETTERS.includes(branch as (typeof BRANCH_LETTERS)[number])) {
      throw new UnprocessableEntityException("hint branch must be A–E");
    }
    const letter = branch as (typeof BRANCH_LETTERS)[number];
    if (seenAxis.has(axisId)) {
      throw new UnprocessableEntityException("duplicate axisId in hint items");
    }
    seenAxis.add(axisId);
    const o = opps[axisId]?.[letter] ?? 0;
    if (o <= 0) {
      throw new UnprocessableEntityException(
        `no question-bank opportunity for axis ${axisId} branch ${letter}`,
      );
    }
  }
}

/**
 * Parses and validates P6.8 `proposedPatch` for dimension-branch hints (accept path).
 * 1–3 items; unique axes; each branch must have opportunities &gt; 0 in the canonical bank.
 *
 * Triggered when `proposedPatch.kind` matches **or** `context.sourceVersion` is P6.8 profile-completion.
 * If `kind` is present it must match the hints envelope (never float keys as kind).
 */
export function parseP6DimensionBranchHintsProposedPatch(
  proposedPatch: unknown,
  context?: { sourceVersion?: string | null },
): DimensionBranchChatHintItem[] {
  if (!isPlainObject(proposedPatch)) {
    throw new UnprocessableEntityException("proposedPatch must be a plain object");
  }
  const sourceOk = isP6DimensionBranchHintsSourceVersion(context?.sourceVersion);
  const kindOk = proposedPatch.kind === P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND;
  if (!kindOk && !sourceOk) {
    throw new UnprocessableEntityException("not a P6.8 dimension-branch hints patch");
  }
  if (
    proposedPatch.kind != null &&
    proposedPatch.kind !== P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND
  ) {
    throw new UnprocessableEntityException(
      "proposedPatch.kind must be g1r_dimension_branch_hints_v1 for P6.8 hints",
    );
  }
  const rawItems = proposedPatch.items;
  if (!Array.isArray(rawItems)) {
    throw new UnprocessableEntityException("proposedPatch.items must be an array");
  }
  if (rawItems.length === 0 || rawItems.length > 3) {
    throw new UnprocessableEntityException(
      "proposedPatch.items must have length 1–3 (no truncation)",
    );
  }

  const items: DimensionBranchChatHintItem[] = [];
  for (const el of rawItems) {
    if (!isPlainObject(el)) {
      throw new UnprocessableEntityException("each hint item must be an object");
    }
    if (typeof el.axisId !== "number" || !Number.isInteger(el.axisId)) {
      throw new UnprocessableEntityException("hint axisId must be an integer");
    }
    if (typeof el.branch !== "string") {
      throw new UnprocessableEntityException("hint branch must be a string");
    }
    items.push({ axisId: el.axisId, branch: el.branch });
  }

  const opps = computeBranchOpportunitiesFromQuestionBank();
  validateItemsAgainstBank(items, opps);
  return items;
}
