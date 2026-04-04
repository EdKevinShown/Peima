import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import CopilotInsightCard from "../components/copilot/CopilotInsightCard";
import { getCopilotInsights } from "../api/copilot";
import { resolveUserId } from "../utils/resolveUserId";

export default function CopilotPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const chatBackHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/chat?${s}` : "/chat";
  }, [conversationId, userId]);

  useEffect(() => {
    if (!conversationId) {
      setInsights(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInsights(null);
    (async () => {
      try {
        const data = await getCopilotInsights(conversationId);
        if (!cancelled) {
          setInsights(data?.conversationId ? data : null);
        }
      } catch (e) {
        if (!cancelled) {
          setInsights(null);
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>沟通建议（只读）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
        基于当前会话的规则化建议，不代发消息、不推送提醒。
        {conversationId ? (
          <>
            {" "}
            conversationId: <code>{conversationId}</code>
          </>
        ) : null}
      </p>

      <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link to={chatBackHref}>返回聊天</Link>
      </div>

      {!conversationId ? (
        <p style={{ color: "#666" }} role="status">
          缺少 conversationId。请从聊天页入口进入，或使用 <code>?conversationId=…</code>。
        </p>
      ) : null}

      {conversationId && loading ? <LoadingState label="加载沟通建议…" /> : null}

      {conversationId && error ? (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      ) : null}

      {conversationId && !loading && !error && !insights ? (
        <p style={{ color: "#666" }} role="status">
          暂无可展示的建议数据。
        </p>
      ) : null}

      {conversationId && !loading && !error && insights ? (
        <CopilotInsightCard insights={insights} showBasedOn />
      ) : null}
    </main>
  );
}
