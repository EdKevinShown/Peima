import { useCallback, useMemo, useState } from "react";
import {
  acceptProfileSuggestion,
  dismissProfileSuggestion,
} from "../../api/profile";
import P6ReviewSummary, {
  normalizeP6ReviewSummary,
  P6ProposedPatchDetails,
} from "./P6ReviewSummary.jsx";

function StatusBadge({ status }) {
  const accepted = status === "accepted";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.12rem 0.4rem",
        borderRadius: 4,
        fontSize: "0.7rem",
        fontWeight: 600,
        flexShrink: 0,
        background: accepted ? "#d1fae5" : "#f3f4f6",
        color: accepted ? "#065f46" : "#4b5563",
        border: `1px solid ${accepted ? "#6ee7b7" : "#e5e7eb"}`,
      }}
    >
      {accepted ? "已接受" : "已忽略"}
    </span>
  );
}

export default function ProfileSuggestionCard({
  suggestions,
  loadError,
  onRefresh,
}) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  const [pendingActionId, setPendingActionId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [processedOpen, setProcessedOpen] = useState(false);

  const pending = useMemo(
    () => list.filter((s) => s.status === "pending"),
    [list],
  );
  const processed = useMemo(() => {
    const rows = list.filter(
      (s) => s.status === "accepted" || s.status === "dismissed",
    );
    return [...rows].sort((a, b) => {
      const ta = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
      const tb = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
      return tb - ta;
    });
  }, [list]);

  const processedAccepted = useMemo(
    () => processed.filter((s) => s.status === "accepted").length,
    [processed],
  );
  const processedDismissed = useMemo(
    () => processed.filter((s) => s.status === "dismissed").length,
    [processed],
  );

  const runAction = useCallback(
    async (suggestionId, fn) => {
      setActionError(null);
      setPendingActionId(suggestionId);
      try {
        await fn(suggestionId);
        await onRefresh?.();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : typeof e === "string" ? e : "操作失败";
        setActionError(msg);
      } finally {
        setPendingActionId(null);
      }
    },
    [onRefresh],
  );

  return (
    <aside
      style={{
        marginBottom: "1rem",
        padding: "0.75rem 1rem",
        border: "1px solid #fde68a",
        borderRadius: 8,
        background: "#fffbeb",
        fontSize: "0.88rem",
        lineHeight: 1.45,
      }}
      aria-label="画像更新建议"
    >
      <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>画像更新建议</div>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#666" }}>
        {processed.length > 0
          ? "待处理可在此确认；已处理记录默认折叠，点击展开查看。"
          : "待处理可在此接受或忽略。与摘要、沟通建议同为规则层提示，不向对方推送。"}
      </p>

      {loadError ? (
        <p style={{ margin: "0 0 0.5rem", color: "#b00020" }} role="alert">
          加载建议列表失败：{loadError}
        </p>
      ) : null}

      {actionError ? (
        <p style={{ margin: "0 0 0.5rem", color: "#b00020" }} role="alert">
          {actionError}
        </p>
      ) : null}

      <div style={{ marginBottom: processed.length > 0 ? "0.65rem" : 0 }}>
        <div
          style={{
            fontSize: "0.82rem",
            color: "#444",
            marginBottom: "0.4rem",
            fontWeight: 600,
          }}
        >
          待处理
          {pending.length > 0 ? `（${pending.length}）` : ""}
        </div>
        {pending.length > 0 ? (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "0.55rem",
            }}
          >
            {pending.map((s) => {
              const busy = pendingActionId === s.id;
              const p6Model = normalizeP6ReviewSummary(s);
              return (
                <li
                  key={s.id}
                  style={{
                    border: "1px solid #fcd34d",
                    borderRadius: 6,
                    padding: "0.5rem 0.6rem",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontSize: "0.78rem", color: "#666", marginBottom: 4 }}>
                    {s.sourceType} · {s.sourceVersion}
                  </div>
                  {p6Model ? (
                    <P6ReviewSummary model={p6Model} compact />
                  ) : (
                    <p
                      style={{
                        margin: "0 0 0.35rem",
                        fontSize: "0.78rem",
                        color: "#64748b",
                      }}
                    >
                      本建议暂无结构化审阅摘要；请展开下方查看原始补丁。
                    </p>
                  )}
                  <P6ProposedPatchDetails proposedPatch={s.proposedPatch} id={s.id} />
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busy || pendingActionId != null}
                      onClick={() => runAction(s.id, acceptProfileSuggestion)}
                    >
                      {busy ? "处理中…" : "接受"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || pendingActionId != null}
                      onClick={() => runAction(s.id, dismissProfileSuggestion)}
                    >
                      {busy ? "处理中…" : "忽略"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ margin: 0, color: "#666", fontSize: "0.82rem" }}>
            当前没有待处理的画像建议。
          </p>
        )}
      </div>

      {processed.length > 0 ? (
        <div
          style={{
            borderTop: "1px dashed #fcd34d",
            paddingTop: "0.55rem",
            marginTop: "0.15rem",
          }}
        >
          <button
            type="button"
            onClick={() => setProcessedOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              textAlign: "left",
              padding: "0.35rem 0.4rem",
              marginBottom: processedOpen ? "0.45rem" : 0,
              background: "#fff",
              border: "1px solid #fcd34d",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "0.82rem",
              color: "#374151",
            }}
            aria-expanded={processedOpen}
          >
            <span>
              <strong>已处理</strong>
              <span style={{ color: "#6b7280", fontWeight: 400 }}>
                {" "}
                · 共 {processed.length} 条（已接受 {processedAccepted} · 已忽略{" "}
                {processedDismissed}）
              </span>
            </span>
            <span style={{ color: "#9ca3af", flexShrink: 0, marginLeft: 8 }}>
              {processedOpen ? "收起 ▲" : "展开 ▼"}
            </span>
          </button>
          {processedOpen ? (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              {processed.map((s) => (
                <li
                  key={s.id}
                  style={{
                    fontSize: "0.78rem",
                    color: "#4b5563",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.45rem",
                    flexWrap: "wrap",
                    padding: "0.35rem 0.45rem",
                    background: "#fff",
                    borderRadius: 6,
                    border: "1px solid #fef3c7",
                  }}
                >
                  <StatusBadge status={s.status} />
                  <span style={{ flex: "1 1 120px", minWidth: 0 }}>
                    <code style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                      {s.id.slice(0, 10)}…
                    </code>
                    {s.resolvedAt ? (
                      <span style={{ display: "block", color: "#888", marginTop: 2 }}>
                        {new Date(s.resolvedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
