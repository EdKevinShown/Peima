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
function PhaseGSubtleNavRow({ pageKey, chatHref, copilotHref, timelineHref, activityHref, linkStyle, isDark }) {
  const sepColor = isDark ? "rgba(255,255,255,0.25)" : "#cbd5e1";
  const sep = (k) => (
    <span key={k} style={{ color: sepColor, userSelect: "none" }} aria-hidden>
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

const PHASE_G_SUBTLE_HINTS = {
  chat: "需要时可看看时间线、沟通建议或反馈记录，主界面仍是发消息。",
  copilot: "这里是聊天参考，不会代替你发消息；想继续聊请回到聊天页。",
  timeline: "回顾你们聊过什么；有新消息时重新打开本页即可更新。",
};

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
  /** 是否在 subtle 模式下展示 conversationId / userId（建议仅 debug 开启） */
  showIdentifierDetails = false,
  /** `dark`：玻璃面板，适配 MainAppShell 深色背景 */
  theme = "light",
  /** 仅展示跨页导航，不重复「本页」标题与说明 */
  navOnly = false,
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

  const isDark = theme === "dark";
  const subtleLink = isDark
    ? { color: "rgba(255,255,255,0.62)", textDecoration: "none", fontWeight: 500 }
    : { color: "#64748b", textDecoration: "none", fontWeight: 500 };
  const sectionClass = [
    "conversation-context-bar",
    navVariant === "phaseG_subtle" ? "conversation-context-bar--subtle" : "",
    isDark ? "conversation-context-bar--dark" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (navOnly && navVariant === "phaseG_subtle") {
    return (
      <nav className={`${sectionClass} conversation-context-bar--nav-only`} aria-label="相关页面">
        <PhaseGSubtleNavRow
          pageKey={pageKey}
          chatHref={chatHref}
          copilotHref={copilotHref}
          timelineHref={timelineHref}
          activityHref={activityHref}
          linkStyle={subtleLink}
          isDark={isDark}
        />
        {showIdentifierDetails ? (
          <details className="conversation-context-bar__ids" style={{ marginTop: "0.45rem" }}>
            <summary>技术标识（管理员）</summary>
            <p>
              conversationId：<code>{convoText}</code>
            </p>
            <p>
              userId：<code>{userText}</code>
            </p>
          </details>
        ) : null}
      </nav>
    );
  }

  return (
    <section className={sectionClass} aria-label="会话上下文栏">
      {navVariant !== "phaseG_subtle" ? (
        <div className="conversation-context-bar__title">当前页面：{pageLabel}</div>
      ) : null}
      {navVariant === "phaseG_subtle" ? (
        <>
          <p className="conversation-context-bar__hint">
            {PHASE_G_SUBTLE_HINTS[pageKey] ?? PHASE_G_SUBTLE_HINTS.chat}
          </p>
          {showIdentifierDetails ? (
            <details className="conversation-context-bar__ids">
              <summary>技术标识（管理员）</summary>
              <p>
                conversationId：<code>{convoText}</code>
              </p>
              <p>
                userId：<code>{userText}</code>
              </p>
            </details>
          ) : null}
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
          isDark={isDark}
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
      {navVariant !== "phaseG_subtle" ? (
        <p className="conversation-context-bar__hint">{freshnessHint}</p>
      ) : null}
      {showFreshnessMeta ? (
        <p className="conversation-context-bar__meta">
          最后刷新：<strong>{refreshedTimeLabel}</strong>
          {" · "}
          刷新来源：<strong>{refreshSourceLabel}</strong>
        </p>
      ) : null}
    </section>
  );
}
