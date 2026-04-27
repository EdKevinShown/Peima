import { Link } from "react-router-dom";

const PAGE_LABELS = {
  chat: "聊天",
  copilot: "沟通洞察",
  timeline: "关系时间线",
};

/**
 * Phase G v0.3：phaseG_subtle 下跨页次级链接顺序（当前页不重复）。
 * Chat：时间线 → 洞察 → 反馈；Copilot：聊天 → 时间线 → 反馈；时间线：聊天 → 洞察 → 反馈。
 */
function PhaseGSubtleNavRow({ pageKey, chatHref, copilotHref, timelineHref, activityHref, linkStyle }) {
  const sep = (k) => (
    <span key={k} style={{ color: "#cbd5e1", userSelect: "none" }} aria-hidden>
      {" "}
      ·{" "}
    </span>
  );
  const L = (key, to, label) => (
    <Link key={key} to={to} style={linkStyle}>
      {label}
    </Link>
  );

  const parts = [];
  if (pageKey === "chat") {
    parts.push(L("tl", timelineHref, "关系时间线"), sep("s1"), L("cp", copilotHref, "沟通洞察"));
    if (activityHref) {
      parts.push(sep("s2"), L("act", activityHref, "我的反馈"));
    }
  } else if (pageKey === "copilot") {
    parts.push(L("ch", chatHref, "聊天"), sep("s1"), L("tl", timelineHref, "关系时间线"));
    if (activityHref) {
      parts.push(sep("s2"), L("act", activityHref, "我的反馈"));
    }
  } else if (pageKey === "timeline") {
    parts.push(L("ch", chatHref, "聊天"), sep("s1"), L("cp", copilotHref, "沟通洞察"));
    if (activityHref) {
      parts.push(sep("s2"), L("act", activityHref, "我的反馈"));
    }
  } else {
    parts.push(L("ch", chatHref, "聊天"), sep("s1"), L("cp", copilotHref, "沟通洞察"), sep("s2"), L("tl", timelineHref, "关系时间线"));
    if (activityHref) {
      parts.push(sep("s3"), L("act", activityHref, "我的反馈"));
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0,
        fontSize: "0.82rem",
      }}
    >
      {parts}
    </div>
  );
}

export default function ConversationContextBar({
  pageKey,
  conversationId,
  userId,
  chatHref,
  copilotHref,
  timelineHref,
  /** Phase G v0.1：次级入口「我的活动 / 反馈」 */
  activityHref,
  freshnessHint,
  lastRefreshedAt,
  refreshSource = "unknown",
  showFreshnessMeta = true,
  /** `phaseG_subtle`：弱化非聊天主路径链接（时间线 / 洞察 / 反馈） */
  navVariant = "default",
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

  const subtleLink = { color: "#64748b", textDecoration: "none", fontWeight: 500 };

  return (
    <section
      style={{
        marginBottom: "1rem",
        padding: "0.7rem 0.8rem",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: navVariant === "phaseG_subtle" ? "#f8fafc" : "#fcfcfc",
      }}
      aria-label="会话上下文栏"
    >
      <div style={{ fontWeight: 600, color: "#111827", marginBottom: "0.3rem" }}>
        {navVariant === "phaseG_subtle" ? "本页" : "当前页面："}
        {navVariant === "phaseG_subtle" ? "" : " "}
        {pageLabel}
      </div>
      {navVariant === "phaseG_subtle" ? (
        <>
          <p style={{ margin: "0 0 0.45rem", color: "#64748b", fontSize: "0.8rem", lineHeight: 1.45 }}>
            以下为<strong>可选</strong>工具，不影响下方主操作「发送」。
          </p>
          <details style={{ marginBottom: "0.45rem", fontSize: "0.78rem", color: "#94a3b8" }}>
            <summary style={{ cursor: "pointer", color: "#64748b" }}>查看会话与账号标识</summary>
            <p style={{ margin: "0.35rem 0 0" }}>
              conversationId：<code>{convoText}</code>
            </p>
            <p style={{ margin: "0.25rem 0 0" }}>
              userId：<code>{userText}</code>
            </p>
          </details>
        </>
      ) : (
        <p style={{ margin: "0 0 0.4rem", color: "#4b5563", fontSize: "0.86rem" }}>
          conversationId: <code>{convoText}</code>
          {" · "}
          userId: <code>{userText}</code>
        </p>
      )}
      {navVariant === "phaseG_subtle" ? (
        <PhaseGSubtleNavRow
          pageKey={pageKey}
          chatHref={chatHref}
          copilotHref={copilotHref}
          timelineHref={timelineHref}
          activityHref={activityHref}
          linkStyle={subtleLink}
        />
      ) : (
        <div
          style={{
            display: "flex",
            gap: "0.7rem",
            flexWrap: "wrap",
            fontSize: "0.9rem",
          }}
        >
          <Link to={chatHref}>聊天</Link>
          <span style={{ color: "#cbd5e1", userSelect: "none" }} aria-hidden>
            ·
          </span>
          <Link to={copilotHref}>沟通洞察</Link>
          <span style={{ color: "#cbd5e1", userSelect: "none" }} aria-hidden>
            ·
          </span>
          <Link to={timelineHref}>关系时间线</Link>
          {activityHref ? (
            <>
              <span style={{ color: "#cbd5e1", userSelect: "none" }} aria-hidden>
                ·
              </span>
              <Link to={activityHref}>我的反馈</Link>
            </>
          ) : null}
        </div>
      )}
      <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.82rem" }}>
        {navVariant === "phaseG_subtle"
          ? "在其他工具里看过内容后，回到本页发消息前可手动刷新摘要。"
          : freshnessHint}
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
