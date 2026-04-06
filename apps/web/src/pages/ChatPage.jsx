import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ChatSummaryCard from "../components/chat/ChatSummaryCard";
import CopilotInsightCard from "../components/copilot/CopilotInsightCard";
import FeedbackQuickActions from "../components/feedback/FeedbackQuickActions";
import ProfileSuggestionCard from "../components/profile/ProfileSuggestionCard";
import { resolveUserId } from "../utils/resolveUserId";
import { getCopilotInsights } from "../api/copilot";
import { listMyProfileSuggestions } from "../api/profile";
import {
  generateConversationSummary,
  getConversation,
  getConversationSummary,
  sendMessage,
} from "../api/chat";

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const [conversationSummary, setConversationSummary] = useState(null);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [summaryActionError, setSummaryActionError] = useState(null);
  const [summaryActionOk, setSummaryActionOk] = useState(null);
  const [copilotInsights, setCopilotInsights] = useState(null);
  const [profileSuggestions, setProfileSuggestions] = useState([]);
  const [profileSuggestionsError, setProfileSuggestionsError] = useState(null);
  /** Bump after send to refresh summary + copilot without touching profile list every time */
  const [p2RefreshKey, setP2RefreshKey] = useState(0);
  const [summaryRetryNonce, setSummaryRetryNonce] = useState(0);
  const [copilotRetryNonce, setCopilotRetryNonce] = useState(0);
  const [summaryLoadError, setSummaryLoadError] = useState(null);
  const [copilotLoadError, setCopilotLoadError] = useState(null);

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

  useEffect(() => {
    if (!conversationId) {
      setConversationSummary(null);
      setSummaryLoadError(null);
      return;
    }
    let cancelled = false;
    setSummaryLoadError(null);
    (async () => {
      try {
        const data = await getConversationSummary(conversationId);
        if (!cancelled) {
          setConversationSummary(data);
          setSummaryLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setConversationSummary(null);
          setSummaryLoadError(
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, p2RefreshKey, summaryRetryNonce]);

  useEffect(() => {
    if (!conversationId) {
      setCopilotInsights(null);
      setCopilotLoadError(null);
      return;
    }
    let cancelled = false;
    setCopilotLoadError(null);
    (async () => {
      try {
        const data = await getCopilotInsights(conversationId);
        if (!cancelled) {
          setCopilotInsights(data);
          setCopilotLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setCopilotInsights(null);
          setCopilotLoadError(
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, p2RefreshKey, copilotRetryNonce]);

  const loadProfileSuggestions = useCallback(async () => {
    if (!conversationId || !userId) {
      setProfileSuggestions([]);
      setProfileSuggestionsError(null);
      return;
    }
    setProfileSuggestionsError(null);
    try {
      const data = await listMyProfileSuggestions();
      setProfileSuggestions(Array.isArray(data) ? data : []);
    } catch (e) {
      setProfileSuggestions([]);
      setProfileSuggestionsError(
        e instanceof Error ? e.message : String(e),
      );
    }
  }, [conversationId, userId]);

  useEffect(() => {
    void loadProfileSuggestions();
  }, [loadProfileSuggestions]);

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
      setP2RefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSending(false);
    }
  }, [conversationId, userId, content, load]);

  const onGenerateSummary = useCallback(async () => {
    if (!conversationId) return;
    setSummaryActionError(null);
    setSummaryActionOk(null);
    setSummaryGenerating(true);
    try {
      const data = await generateConversationSummary(conversationId);
      setConversationSummary(data);
      setSummaryLoadError(null);
      setCopilotRetryNonce((n) => n + 1);
      setSummaryActionOk("摘要已更新；沟通建议已尝试刷新");
      window.setTimeout(() => {
        setSummaryActionOk(null);
      }, 3200);
    } catch (e) {
      setSummaryActionError(
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSummaryGenerating(false);
    }
  }, [conversationId]);

  const messages = conversation?.messages ?? [];

  const copilotFullHref = useMemo(() => {
    if (!conversationId) return "/copilot";
    const q = new URLSearchParams();
    q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    return `/copilot?${q.toString()}`;
  }, [conversationId, userId]);

  const timelineHref = useMemo(() => {
    if (!conversationId) return "/chat/timeline";
    const q = new URLSearchParams();
    q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    return `/chat/timeline?${q.toString()}`;
  }, [conversationId, userId]);

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

      {conversationId ? (
        <section
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem 0.85rem",
            border: "1px solid #e8e8e8",
            borderRadius: 10,
            background: "#fcfcfc",
          }}
          aria-label="会话周边：摘要与沟通建议（规则层，只读）"
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
            会话周边（规则层 · 只读）
          </h2>
          <p style={{ margin: "0 0 0.65rem", fontSize: "0.78rem", color: "#666" }}>
            摘要、沟通建议、快捷反馈与画像建议由规则/占位逻辑生成，不代发消息、不向对方推送通知。
          </p>
          <div style={{ marginBottom: "0.85rem" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem 0.75rem",
                marginBottom: "0.45rem",
                fontSize: "0.88rem",
              }}
            >
              <button
                type="button"
                onClick={onGenerateSummary}
                disabled={summaryGenerating}
              >
                {summaryGenerating ? "生成中…" : "生成并更新摘要"}
              </button>
              <button
                type="button"
                onClick={() => setSummaryRetryNonce((n) => n + 1)}
                disabled={summaryGenerating}
              >
                重试加载摘要
              </button>
              {summaryActionOk ? (
                <span style={{ color: "#0d6832" }} role="status">
                  {summaryActionOk}
                </span>
              ) : null}
              {summaryActionError ? (
                <span style={{ color: "#b00020" }} role="alert">
                  {summaryActionError}
                </span>
              ) : null}
            </div>
            {summaryLoadError ? (
              <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                摘要加载失败：{summaryLoadError}
              </p>
            ) : null}
            <ChatSummaryCard summary={conversationSummary} />
          </div>
          <div style={{ marginBottom: "0.35rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <button
                type="button"
                onClick={() => setCopilotRetryNonce((n) => n + 1)}
              >
                重试加载沟通建议
              </button>
            </div>
            {copilotLoadError ? (
              <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                沟通建议加载失败：{copilotLoadError}
              </p>
            ) : null}
            <CopilotInsightCard insights={copilotInsights} />
          </div>
        </section>
      ) : null}
      {conversationId ? (
        <p style={{ fontSize: "0.85rem", margin: "0 0 0.35rem" }}>
          <Link to={copilotFullHref}>查看本会话完整沟通建议（只读）</Link>
        </p>
      ) : null}
      {conversationId ? (
        <p style={{ fontSize: "0.85rem", margin: "0 0 1rem" }}>
          <Link to={timelineHref}>查看关系时间线（只读）</Link>
        </p>
      ) : null}
      {conversationId ? (
        <ProfileSuggestionCard
          suggestions={profileSuggestions}
          loadError={profileSuggestionsError}
          onRefresh={loadProfileSuggestions}
        />
      ) : null}

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
            <FeedbackQuickActions
              conversationId={conversationId}
              userId={userId}
              disabled={sending || !conversationId}
            />
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
