import { Link } from "react-router-dom";

const PAGE_LABELS = {
  chat: "聊天",
  copilot: "沟通洞察",
  timeline: "关系时间线",
};

export default function ConversationContextBar({
  pageKey,
  conversationId,
  userId,
  chatHref,
  copilotHref,
  timelineHref,
  freshnessHint,
  lastRefreshedAt,
  refreshSource = "unknown",
  showFreshnessMeta = true,
}) {
  const pageLabel = PAGE_LABELS[pageKey] ?? pageKey;
  const convoText = conversationId || "（未设置）";
  const userText = userId || "（未设置）";
  const refreshSourceLabel =
    refreshSource === "initial"
      ? "首次加载"
      : refreshSource === "manual"
        ? "手动刷新"
        : refreshSource === "chat_action"
          ? "聊天动作后更新"
          : "未知";
  const refreshedTimeLabel = (() => {
    if (!lastRefreshedAt) return "—";
    const d = new Date(lastRefreshedAt);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString();
  })();

  return (
    <section
      style={{
        marginBottom: "1rem",
        padding: "0.7rem 0.8rem",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fcfcfc",
      }}
      aria-label="会话上下文栏"
    >
      <div style={{ fontWeight: 600, color: "#111827", marginBottom: "0.3rem" }}>
        当前页面：{pageLabel}
      </div>
      <p style={{ margin: "0 0 0.4rem", color: "#4b5563", fontSize: "0.86rem" }}>
        conversationId: <code>{convoText}</code>
        {" · "}
        userId: <code>{userText}</code>
      </p>
      <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", fontSize: "0.9rem" }}>
        <Link to={chatHref}>聊天</Link>
        <Link to={copilotHref}>沟通洞察</Link>
        <Link to={timelineHref}>关系时间线</Link>
      </div>
      <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.82rem" }}>
        {freshnessHint}
      </p>
      {showFreshnessMeta ? (
        <p style={{ margin: "0.3rem 0 0", color: "#6b7280", fontSize: "0.8rem" }}>
          最后刷新：<strong>{refreshedTimeLabel}</strong>
          {" · "}
          刷新来源：<strong>{refreshSourceLabel}</strong>
        </p>
      ) : null}
    </section>
  );
}
