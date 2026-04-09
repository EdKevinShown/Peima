import { useState } from "react";
import { submitFeedback } from "../../api/feedback";

const SOURCE_TYPE = "rule_based";
const SOURCE_VERSION = "p2-web-chat-quick-v1";

/**
 * Minimal thumbs feedback for current conversation (no heavy form).
 */
export default function FeedbackQuickActions({
  conversationId,
  userId,
  disabled,
}) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  if (!conversationId || !userId) return null;

  async function fire(rating, tag) {
    if (busy || disabled) return;
    setBusy(true);
    setHint("");
    try {
      await submitFeedback({
        userId,
        subjectKind: "conversation",
        subjectId: conversationId,
        rating,
        tags: [tag],
        sourceType: SOURCE_TYPE,
        sourceVersion: SOURCE_VERSION,
      });
      setHint("已记录，感谢反馈（仅用于产品与体验改进，不通知对方）");
      setTimeout(() => setHint(""), 5000);
    } catch (e) {
      setHint(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
      <span style={{ color: "#555", marginRight: "0.5rem" }}>本会话快捷反馈</span>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => fire(5, "quick_thumbs_up")}
        style={{ marginRight: "0.35rem" }}
        title="满意"
      >
        👍
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => fire(3, "quick_neutral")}
        style={{ marginRight: "0.35rem" }}
        title="一般"
      >
        😐
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => fire(1, "quick_thumbs_down")}
        title="不满意"
      >
        👎
      </button>
      {hint ? (
        <span
          style={{
            marginLeft: "0.6rem",
            color: hint.includes("失败") || hint.includes("未登录") ? "#b00020" : "#2e7d32",
          }}
          role={hint.includes("失败") || hint.includes("未登录") ? "alert" : "status"}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
