import type { DimensionBranchChatHintItem } from "../questionnaire/dimension-branch-chat-hints";

/** Stored in `ProfileUpdateSuggestion.reviewSummary` for P6.8 chat-generated rows. */
export const P6_8_PROFILE_COMPLETION_REVIEW_SUMMARY_KIND =
  "p6.8-profile-completion-review-v1" as const;

/**
 * Builds review JSON from the same `hintItems` that are persisted in `proposedPatch.items`.
 */
export function buildP6ChatProfileCompletionReviewSummary(
  hintItems: ReadonlyArray<DimensionBranchChatHintItem>,
): Record<string, unknown> {
  const dimensions = hintItems.map((item) => ({
    axisId: item.axisId,
    branch: item.branch,
    oneLine: `维度 ${item.axisId} · 分支 ${item.branch}`,
  }));

  const highlights = [
    "基于当前对话，建议在问卷维度上补充以下分支线索（仅影响本账号问卷命中补充，不向对方展示）。",
    "下列维度与分支与「原始补丁」中的条目一一对应；接受后写入与之一致的补丁结构。",
  ];

  const afterAcceptNote =
    "接受后：将把上述分支作为问卷维度分支命中补充合并进画像（与系统 apply 路径一致）。";

  return {
    schemaVersion: 1,
    kind: P6_8_PROFILE_COMPLETION_REVIEW_SUMMARY_KIND,
    highlights,
    dimensions,
    afterAcceptNote,
  };
}
