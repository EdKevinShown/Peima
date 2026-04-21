import { useMemo } from "react";

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

function patchPreview(patch) {
  if (patch == null) return "（无补丁内容）";
  try {
    const s = JSON.stringify(patch, null, 0);
    return s.length > 280 ? `${s.slice(0, 280)}…` : s;
  } catch {
    return String(patch);
  }
}

/**
 * @param {{ suggestion?: object, model?: ReturnType<typeof normalizeP6ReviewSummary>, compact?: boolean }} props
 */
export default function P6ReviewSummary({
  suggestion,
  model: modelProp,
  compact = false,
}) {
  const model = useMemo(() => {
    if (modelProp) return modelProp;
    if (!suggestion) return null;
    return normalizeP6ReviewSummary(suggestion);
  }, [modelProp, suggestion]);

  if (!model) return null;

  const titleSize = compact ? "0.78rem" : "0.82rem";
  const textSize = compact ? "0.76rem" : "0.8rem";

  return (
    <div
      style={{
        marginBottom: compact ? "0.35rem" : "0.5rem",
        padding: compact ? "0.4rem 0.5rem" : "0.45rem 0.55rem",
        borderRadius: 6,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      {model.legacy ? (
        <p
          style={{
            margin: "0 0 0.35rem",
            fontSize: "0.72rem",
            color: "#92400e",
            fontWeight: 600,
          }}
        >
          历史建议无摘要
        </p>
      ) : null}
      <ul
        style={{
          margin: "0 0 0.4rem",
          paddingLeft: "1.1rem",
          fontSize: textSize,
          color: "#334155",
          lineHeight: 1.45,
        }}
      >
        {model.highlights.map((h, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            {h}
          </li>
        ))}
      </ul>
      <div
        style={{
          fontSize: titleSize,
          fontWeight: 600,
          color: "#1e293b",
          marginBottom: 4,
        }}
      >
        将影响的维度 / 分支
      </div>
      <ul
        style={{
          margin: "0 0 0.45rem",
          paddingLeft: "1.1rem",
          fontSize: textSize,
          color: "#334155",
          lineHeight: 1.4,
        }}
      >
        {model.dimensions.map((d) => (
          <li key={`${d.axisId}-${d.branch}`}>{d.oneLine}</li>
        ))}
      </ul>
      <div
        style={{
          fontSize: titleSize,
          fontWeight: 600,
          color: "#1e293b",
          marginBottom: 4,
        }}
      >
        接受后
      </div>
      <p style={{ margin: 0, fontSize: textSize, color: "#475569", lineHeight: 1.45 }}>
        {model.afterAcceptNote}
      </p>
    </div>
  );
}

export function P6ProposedPatchDetails({ proposedPatch, id }) {
  return (
    <details
      style={{
        marginTop: "0.35rem",
        fontSize: "0.72rem",
        color: "#64748b",
      }}
    >
      <summary style={{ cursor: "pointer", userSelect: "none" }}>
        高级：原始补丁（JSON）
      </summary>
      <pre
        style={{
          margin: "0.35rem 0 0",
          padding: "0.35rem",
          fontSize: "0.7rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 120,
          overflow: "auto",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 4,
        }}
        id={id ? `patch-${id}` : undefined}
      >
        {patchPreview(proposedPatch)}
      </pre>
    </details>
  );
}
