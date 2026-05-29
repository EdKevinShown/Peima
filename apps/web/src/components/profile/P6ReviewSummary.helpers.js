/** Must match API `dimension-branch-chat-hints.constants` / patch envelope. */
export const P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND =
  "g1r_dimension_branch_hints_v1";

export const P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION =
  "p6.8-profile-completion-chat-ai-v1";

export const P6_8_PROFILE_COMPLETION_REVIEW_SUMMARY_KIND =
  "p6.8-profile-completion-review-v1";

function parseDimensionPatchItems(proposedPatch) {
  if (
    proposedPatch == null ||
    typeof proposedPatch !== "object" ||
    Array.isArray(proposedPatch)
  ) {
    return null;
  }
  const kind = proposedPatch.kind;
  if (kind !== P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND) return null;
  const raw = proposedPatch.items;
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const el of raw) {
    if (el == null || typeof el !== "object" || Array.isArray(el)) return null;
    const axisId = el.axisId;
    const branch = el.branch;
    if (typeof axisId !== "number" || !Number.isInteger(axisId)) return null;
    if (typeof branch !== "string") return null;
    out.push({ axisId, branch });
  }
  return out;
}

/**
 * @param {object} suggestion — row from `mine` (subset of fields used)
 * @returns {{ legacy: boolean, highlights: string[], dimensions: { axisId: number, branch: string, oneLine: string }[], afterAcceptNote: string } | null}
 */
export function normalizeP6ReviewSummary(suggestion) {
  if (!suggestion || typeof suggestion !== "object") return null;

  const rs = suggestion.reviewSummary;
  if (
    rs != null &&
    typeof rs === "object" &&
    !Array.isArray(rs) &&
    rs.kind === P6_8_PROFILE_COMPLETION_REVIEW_SUMMARY_KIND &&
    Array.isArray(rs.highlights) &&
    Array.isArray(rs.dimensions)
  ) {
    const highlights = rs.highlights.filter((h) => typeof h === "string");
    const dimensions = [];
    for (const d of rs.dimensions) {
      if (d == null || typeof d !== "object" || Array.isArray(d)) continue;
      const axisId = d.axisId;
      const branch = d.branch;
      const oneLine =
        typeof d.oneLine === "string"
          ? d.oneLine
          : typeof axisId === "number" &&
              Number.isInteger(axisId) &&
              typeof branch === "string"
            ? `维度 ${axisId} · 分支 ${branch}`
            : null;
      if (
        typeof axisId !== "number" ||
        !Number.isInteger(axisId) ||
        typeof branch !== "string" ||
        !oneLine
      ) {
        continue;
      }
      dimensions.push({ axisId, branch, oneLine });
    }
    const afterAcceptNote =
      typeof rs.afterAcceptNote === "string" ? rs.afterAcceptNote : "";
    if (highlights.length < 2 || dimensions.length === 0) return null;
    return { legacy: false, highlights, dimensions, afterAcceptNote };
  }

  if (suggestion.sourceVersion !== P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION) {
    return null;
  }

  const items = parseDimensionPatchItems(suggestion.proposedPatch);
  if (!items?.length) return null;

  const dimensions = items.map((item) => ({
    axisId: item.axisId,
    branch: item.branch,
    oneLine: `维度 ${item.axisId} · 分支 ${item.branch}`,
  }));

  return {
    legacy: true,
    highlights: [
      "历史建议无摘要（数据写入于审阅摘要功能上线前）。",
      "以下维度列表由原始补丁条目推导，与接受时所应用的条目一致。",
    ],
    dimensions,
    afterAcceptNote:
      "接受后：将把所列分支合并进问卷维度命中补充（与系统 apply 路径一致）。",
  };
}
