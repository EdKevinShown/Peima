/**
 * P2: lightweight summary strip; parent hides when no data / load failed.
 */
export default function ChatSummaryCard({
  summary,
  footerNote,
  variant = "light",
  showTechnicalMeta = false,
}) {
  if (!summary?.summary) return null;

  let timeLabel = summary.generatedAt;
  try {
    timeLabel = new Date(summary.generatedAt).toLocaleString();
  } catch {
    /* keep raw */
  }

  const meta = [];
  if (summary.persisted === true) meta.push("已持久化");
  if (summary.sourceType) meta.push(`来源 ${summary.sourceType}`);

  const isDark = variant === "dark";

  if (isDark) {
    return (
      <aside className="chat-embedded-card" aria-label="会话摘要">
        <div className="chat-embedded-card__title">会话摘要</div>
        <p style={{ margin: "0 0 0.5rem" }}>{summary.summary}</p>
        {summary.chatStageHint ? (
          <p style={{ margin: "0 0 0.5rem", color: "rgba(255,255,255,0.62)" }}>{summary.chatStageHint}</p>
        ) : null}
        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)" }}>
          更新于 {timeLabel}
          {showTechnicalMeta && meta.length > 0 ? ` · ${meta.join(" · ")}` : null}
        </div>
        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", margin: "0.5rem 0 0" }}>
          {footerNote ?? "摘要根据当前聊天记录整理，不会代发消息或通知对方。"}
        </p>
      </aside>
    );
  }

  return (
    <aside
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        background: "#f9fafb",
        fontSize: "0.92rem",
        lineHeight: 1.5,
      }}
      aria-label="会话摘要"
    >
      <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>会话摘要</div>
      <p style={{ margin: "0 0 0.5rem" }}>{summary.summary}</p>
      {summary.chatStageHint ? (
        <p style={{ margin: "0 0 0.5rem", color: "#444" }}>{summary.chatStageHint}</p>
      ) : null}
      <div style={{ fontSize: "0.8rem", color: "#666" }}>
        生成时间：{timeLabel}
        {meta.length > 0 ? ` · ${meta.join(" · ")}` : null}
      </div>
      <p style={{ fontSize: "0.75rem", color: "#777", margin: "0.5rem 0 0" }}>
        {footerNote ?? "摘要为规则生成，不代发消息、不自动通知对方。"}
      </p>
    </aside>
  );
}
