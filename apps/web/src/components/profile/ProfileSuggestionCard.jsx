/**
 * Chat 页只做「有待处理建议」轻提示；accept/dismiss 留给专门入口，避免在聊天主流程里误触。
 */
export default function ProfileSuggestionCard({ pendingSuggestions }) {
  const list = Array.isArray(pendingSuggestions) ? pendingSuggestions : [];
  if (list.length === 0) return null;

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
      <p style={{ margin: 0, color: "#444" }}>
        你有 <strong>{list.length}</strong> 条待处理的画像更新建议，可在后续「建议」入口查看并确认。
      </p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#666" }}>
        首版聊天页仅提示，不在此直接接受/忽略，避免与发消息主流程混淆。
      </p>
    </aside>
  );
}
