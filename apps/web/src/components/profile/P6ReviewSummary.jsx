import { useMemo } from "react";
import { normalizeP6ReviewSummary } from "./P6ReviewSummary.helpers.js";

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
