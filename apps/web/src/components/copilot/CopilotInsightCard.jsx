function ListBlock({ title, items }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#333" }}>{title}</div>
      <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", color: "#444" }}>
        {items.map((t, i) => (
          <li key={i} style={{ marginBottom: "0.2rem" }}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Rule-based Copilot strip — not auto-chat; parent hides on failure / empty.
 */
export default function CopilotInsightCard({ insights }) {
  if (!insights?.conversationId) return null;

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
      <ListBlock title="建议" items={insights.communicationAdvice} />
      <ListBlock title="风险提示" items={insights.riskHints} />
      <ListBlock title="可聊方向" items={insights.suggestedTopics} />
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
