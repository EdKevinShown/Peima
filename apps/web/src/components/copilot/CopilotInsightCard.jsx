function ListBlock({ title, items, dark }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.85rem",
          color: dark ? "rgba(255,255,255,0.88)" : "#333",
        }}
      >
        {title}
      </div>
      <ul
        style={{
          margin: "0.25rem 0 0",
          paddingLeft: "1.1rem",
          color: dark ? "rgba(255,255,255,0.68)" : "#444",
        }}
      >
        {items.map((t, i) => (
          <li key={i} style={{ marginBottom: "0.2rem" }}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** P6.2: one-line hint; does not change layout structure. */
function CopilotSourceHint({ sourceType, dark }) {
  if (!sourceType) return null;
  const hintColor = dark ? "rgba(255,255,255,0.45)" : "#64748b";
  if (sourceType === "rule_based") {
    return (
      <div style={{ fontSize: "0.78rem", color: hintColor, marginTop: "0.35rem" }}>
        来源：规则建议（未开 AI_COPILOT、缺 API Key，或 Kimi/模型请求失败时已回退，内容仍可用作参考）
      </div>
    );
  }
  if (sourceType.startsWith("model_")) {
    const slug = sourceType.slice("model_".length);
    const labels = {
      kimi: "Kimi (Moonshot)",
      deepseek: "DeepSeek",
      openai: "OpenAI",
      anthropic: "Anthropic",
      azure_openai: "Azure OpenAI",
      openai_compatible: "OpenAI 兼容 API",
      unknown: "LLM",
    };
    const label = labels[slug] || slug.replace(/_/g, " ");
    return (
      <div style={{ fontSize: "0.78rem", color: hintColor, marginTop: "0.35rem" }}>
        来源：模型建议（{label}，OpenAI 兼容协议）
      </div>
    );
  }
  return null;
}

function BasedOnLine({ basedOn, dark }) {
  if (!basedOn || typeof basedOn !== "object") return null;
  const parts = [];
  if (basedOn.summary) parts.push("会话摘要");
  if (basedOn.feedbackOnConversation) parts.push("会话反馈");
  if (basedOn.behaviorSignals) parts.push("行为信号");
  if (basedOn.pendingProfileSuggestions) parts.push("待处理画像建议");
  if (parts.length === 0) return null;
  return (
    <div
      style={{
        fontSize: "0.78rem",
        color: dark ? "rgba(255,255,255,0.5)" : "#555",
        marginTop: "0.45rem",
      }}
    >
      <span style={{ fontWeight: 600 }}>依据</span>（摘要来源）：{parts.join(" · ")}
    </div>
  );
}

/**
 * Rule-based Copilot strip — not auto-chat; parent hides on failure / empty.
 * @param {{ showBasedOn?: boolean }} [opts]
 */
export default function CopilotInsightCard({
  insights,
  showBasedOn = false,
  variant = "light",
  showTechnicalMeta = false,
}) {
  if (!insights?.conversationId) return null;

  const isDark = variant === "dark";
  const metaColor = isDark ? "rgba(255,255,255,0.55)" : "#555";
  const footColor = isDark ? "rgba(255,255,255,0.4)" : "#666";

  if (isDark) {
    return (
      <aside className="chat-embedded-card chat-embedded-card--insight" aria-label="沟通建议">
        <div className="chat-embedded-card__title">沟通建议</div>
        {showTechnicalMeta ? (
          <div style={{ fontSize: "0.82rem", color: metaColor }}>
            状态：{insights.relationshipState}
            {insights.sourceType ? ` · ${insights.sourceType}` : ""}
          </div>
        ) : null}
        {showTechnicalMeta ? <CopilotSourceHint sourceType={insights.sourceType} dark /> : null}
        <ListBlock title="可以试着" items={insights.communicationAdvice} dark />
        <ListBlock title="留意一下" items={insights.riskHints} dark />
        <ListBlock title="话题参考" items={insights.suggestedTopics} dark />
        {showBasedOn && showTechnicalMeta ? <BasedOnLine basedOn={insights.basedOn} dark /> : null}
        <div style={{ fontSize: "0.75rem", color: footColor, marginTop: "0.5rem" }}>
          仅供参考，需要你亲自发送 ·{" "}
          {(() => {
            try {
              return new Date(insights.generatedAt).toLocaleString();
            } catch {
              return insights.generatedAt;
            }
          })()}
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        border: "1px solid #dbeafe",
        borderRadius: 8,
        background: "#f0f7ff",
        fontSize: "0.9rem",
        lineHeight: 1.45,
      }}
      aria-label="沟通建议（基础层）"
    >
      <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>沟通建议（基础层）</div>
      <div style={{ fontSize: "0.82rem", color: "#555" }}>
        状态：<code>{insights.relationshipState}</code>
        {insights.sourceType ? (
          <>
            {" "}
            · {insights.sourceType} / {insights.sourceVersion}
          </>
        ) : null}
      </div>
      <CopilotSourceHint sourceType={insights.sourceType} />
      <ListBlock title="建议" items={insights.communicationAdvice} />
      <ListBlock title="风险提示" items={insights.riskHints} />
      <ListBlock title="可聊方向" items={insights.suggestedTopics} />
      {showBasedOn ? <BasedOnLine basedOn={insights.basedOn} /> : null}
      <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.5rem" }}>
        仅供参考，不会代你发消息 ·{" "}
        {(() => {
          try {
            return new Date(insights.generatedAt).toLocaleString();
          } catch {
            return insights.generatedAt;
          }
        })()}
      </div>
    </aside>
  );
}
