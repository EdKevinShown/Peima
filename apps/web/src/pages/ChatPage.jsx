import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";
import { getConversation, sendMessage } from "../api/chat";

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) {
      setError(new Error("缺少 conversationId，请通过聊天入口进入"));
      setConversation(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getConversation(conversationId);
      setConversation(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setConversation(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSend = useCallback(async () => {
    if (!conversationId || !userId) {
      setError(new Error("缺少 userId 或 conversationId"));
      return;
    }
    const text = content.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    try {
      await sendMessage({
        conversationId,
        senderUserId: userId,
        content: text,
      });
      setContent("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSending(false);
    }
  }, [conversationId, userId, content, load]);

  const messages = conversation?.messages ?? [];

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>聊天</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
        {conversationId ? (
          <>
            {" · "}
            conversationId: <code>{conversationId}</code>
          </>
        ) : null}
      </p>

      {loading && <LoadingState label="加载对话…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && conversation && (
        <section style={{ border: "1px solid #ddd", borderRadius: 8 }}>
          <div style={{ padding: "0.75rem 1rem", background: "#fafafa" }}>
            <div style={{ fontSize: "0.95rem", color: "#333" }}>
              viewer: <code>{conversation.viewerUserId}</code>
            </div>
            <div style={{ fontSize: "0.95rem", color: "#333" }}>
              candidate: <code>{conversation.candidateUserId}</code>
            </div>
          </div>

          <div
            style={{
              padding: "1rem",
              maxHeight: 420,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              background: "#fff",
            }}
          >
            {messages.length === 0 ? (
              <p style={{ color: "#666", margin: 0 }}>暂无消息</p>
            ) : (
              messages.map((m) => {
                const mine = m.senderUserId === userId;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: mine ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "70%",
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: "0.55rem 0.7rem",
                        background: mine ? "#e6f3ff" : "#f4f4f4",
                      }}
                    >
                      <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                        {m.content}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 4 }}>
                        sender: {m.senderUserId}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid #eee",
              background: "#fafafa",
            }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
              placeholder="输入消息…"
            />
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <button
                type="button"
                onClick={onSend}
                disabled={sending || !userId || !conversationId || content.trim().length === 0}
              >
                {sending ? "发送中…" : "发送"}
              </button>
              <button type="button" onClick={load} disabled={loading}>
                刷新
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
