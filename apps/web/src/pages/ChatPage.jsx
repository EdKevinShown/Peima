import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import ChatSummaryCard from "../components/chat/ChatSummaryCard";
import CopilotInsightCard from "../components/copilot/CopilotInsightCard";
import ProfileSuggestionCard from "../components/profile/ProfileSuggestionCard";
import { resolveUserId } from "../utils/resolveUserId";
import { getCopilotInsights } from "../api/copilot";
import {
  acceptProfileSuggestion,
  dismissProfileSuggestion,
  listMyProfileSuggestions,
} from "../api/profile";
import { submitFeedback } from "../api/feedback";
import {
  generateConversationSummary,
  getConversation,
  getConversationSummary,
  sendMessage,
} from "../api/chat";
import { getSummaryAi } from "../api/summary-ai";

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
  const [summaryAiResult, setSummaryAiResult] = useState(null);
  const [summaryAiLoading, setSummaryAiLoading] = useState(false);
  const [summaryAiError, setSummaryAiError] = useState(null);
  const [copilotLoadError, setCopilotLoadError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [refreshSource, setRefreshSource] = useState("unknown");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);
  const [suggestionActionBusy, setSuggestionActionBusy] = useState(false);
  const [suggestionActionError, setSuggestionActionError] = useState(null);
  const [suggestionActionResult, setSuggestionActionResult] = useState(null);

  const load = useCallback(async (source = "manual") => {
    if (!conversationId) {
      setError(new Error("缺少 conversationId。请先从聊天入口进入会话后再进行跨页查看。"));
      setConversation(null);
      setLastRefreshedAt(null);
      setRefreshSource("unknown");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getConversation(conversationId);
      setConversation(data);
      setLastRefreshedAt(Date.now());
      setRefreshSource(source);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setConversation(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load("initial");
  }, [load]);

  const onFetchSummaryAi = useCallback(async () => {
    if (!conversationId) return;
    setSummaryAiError(null);
    setSummaryAiLoading(true);
    try {
      const data = await getSummaryAi(conversationId);
      setSummaryAiResult(data);
    } catch (e) {
      setSummaryAiResult(null);
      setSummaryAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setSummaryAiLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setConversationSummary(null);
      setSummaryLoadError(null);
      setSummaryAiResult(null);
      setSummaryAiError(null);
      return;
    }
    setSummaryAiResult(null);
    setSummaryAiError(null);
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
      setError(new Error("缺少 userId 或 conversationId。请确认当前会话参数完整。"));
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
      await load("chat_action");
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
      setLastRefreshedAt(Date.now());
      setRefreshSource("chat_action");
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
  const latestPendingSuggestion = useMemo(() => {
    const rows = (profileSuggestions ?? []).filter(
      (s) => s.status === "pending",
    );
    if (rows.length === 0) return null;
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }, [profileSuggestions]);

  const workflowSteps = useMemo(
    () => [
      {
        key: "summary",
        label: "会话摘要",
        status: summaryLoadError
          ? "失败"
          : conversationSummary
            ? "已就绪"
            : "待加载",
      },
      {
        key: "copilot",
        label: "沟通洞察",
        status: copilotLoadError
          ? "失败"
          : copilotInsights
            ? "已就绪"
            : "待加载",
      },
      {
        key: "feedback",
        label: "我的反馈",
        status: feedbackResult ? "已提交" : "待提交",
      },
      {
        key: "suggestion",
        label: "画像建议处理",
        status: latestPendingSuggestion
          ? "待处理"
          : suggestionActionResult
            ? "已处理"
            : "无待处理",
      },
      {
        key: "timeline",
        label: "关系时间线查看",
        status: "可查看",
      },
    ],
    [
      summaryLoadError,
      conversationSummary,
      copilotLoadError,
      copilotInsights,
      feedbackResult,
      latestPendingSuggestion,
      suggestionActionResult,
    ],
  );

  const onSubmitFeedback = useCallback(async () => {
    if (!conversationId || !userId || feedbackSubmitting) return;
    setFeedbackError(null);
    setFeedbackResult(null);
    setFeedbackSubmitting(true);
    try {
      await submitFeedback({
        userId,
        subjectKind: "conversation",
        subjectId: conversationId,
        rating: feedbackRating,
        comment: feedbackComment.trim() || undefined,
        tags: ["post_chat_action_hub"],
        sourceType: "rule_based",
        sourceVersion: "p4-post-chat-action-hub-v1",
      });
      setFeedbackResult("反馈已提交");
      setFeedbackComment("");
      window.setTimeout(() => setFeedbackResult(null), 3200);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : String(e));
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    conversationId,
    userId,
    feedbackSubmitting,
    feedbackRating,
    feedbackComment,
  ]);

  const onHandleLatestSuggestion = useCallback(
    async (action) => {
      if (!latestPendingSuggestion || suggestionActionBusy) return;
      setSuggestionActionBusy(true);
      setSuggestionActionError(null);
      setSuggestionActionResult(null);
      try {
        if (action === "accept") {
          await acceptProfileSuggestion(latestPendingSuggestion.id);
          setSuggestionActionResult("已接受最新画像建议");
        } else {
          await dismissProfileSuggestion(latestPendingSuggestion.id);
          setSuggestionActionResult("已忽略最新画像建议");
        }
        await loadProfileSuggestions();
        setP2RefreshKey((k) => k + 1);
        window.setTimeout(() => setSuggestionActionResult(null), 3200);
      } catch (e) {
        setSuggestionActionError(e instanceof Error ? e.message : String(e));
      } finally {
        setSuggestionActionBusy(false);
      }
    },
    [latestPendingSuggestion, suggestionActionBusy, loadProfileSuggestions],
  );

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

  const chatSelfHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/chat?${s}` : "/chat";
  }, [conversationId, userId]);

  const freshnessHint =
    "发送消息或更新摘要后，前往沟通洞察或关系时间线时建议手动刷新，查看最新状态。";

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>聊天</h1>
      <ConversationContextBar
        pageKey="chat"
        conversationId={conversationId}
        userId={userId}
        chatHref={chatSelfHref}
        copilotHref={copilotFullHref}
        timelineHref={timelineHref}
        freshnessHint={freshnessHint}
        lastRefreshedAt={lastRefreshedAt}
        refreshSource={refreshSource}
      />

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
          aria-label="聊天后行动闭环（P4-MVP）"
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
            聊天后行动闭环（P4-MVP）
          </h2>
          <p style={{ margin: "0 0 0.65rem", fontSize: "0.78rem", color: "#666" }}>
            将摘要、洞察、反馈、建议处理与时间线收口为一次连续动作。当前为规则层能力，不涉及真实模型链路。
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "0.4rem",
              marginBottom: "0.75rem",
            }}
          >
            {workflowSteps.map((step) => (
              <div
                key={step.key}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.45rem 0.55rem",
                  background: "#fff",
                  fontSize: "0.8rem",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2, color: "#111827" }}>{step.label}</div>
                <div
                  style={{
                    color: "#4b5563",
                    display: "inline-block",
                    padding: "0.05rem 0.35rem",
                    borderRadius: 999,
                    background:
                      step.status === "失败"
                        ? "#fee2e2"
                        : step.status === "已就绪" || step.status === "已提交" || step.status === "已处理"
                          ? "#dcfce7"
                          : "#f3f4f6",
                  }}
                >
                  {step.status}
                </div>
              </div>
            ))}
          </div>
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
                {summaryGenerating ? "更新中…" : "更新摘要"}
              </button>
              <button
                type="button"
                onClick={() => setSummaryRetryNonce((n) => n + 1)}
                disabled={summaryGenerating}
              >
                重新加载摘要
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
                会话摘要加载失败：{summaryLoadError}
              </p>
            ) : null}
            <ChatSummaryCard summary={conversationSummary} />
            <div
              style={{
                marginTop: "0.75rem",
                paddingTop: "0.65rem",
                borderTop: "1px dashed #e5e7eb",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                <button type="button" onClick={onFetchSummaryAi} disabled={summaryAiLoading}>
                  {summaryAiLoading ? "拉取中…" : "拉取 AI 摘要（试点）"}
                </button>
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  独立接口，不写入聊天摘要持久化；失败不影响发消息与沟通洞察。
                </span>
              </div>
              {summaryAiError ? (
                <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                  AI 摘要请求失败：{summaryAiError}
                </p>
              ) : null}
              {summaryAiResult ? (
                <ChatSummaryCard
                  summary={{
                    ...summaryAiResult,
                    persisted: false,
                  }}
                  footerNote="P6.5 AI 摘要试点：成功时为模型输出；失败时为规则占位。不写入持久化、不代发消息。"
                />
              ) : null}
            </div>
          </div>
          <div style={{ marginBottom: "0.85rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <button
                type="button"
                onClick={() => setCopilotRetryNonce((n) => n + 1)}
              >
                重新加载沟通洞察
              </button>
            </div>
            {copilotLoadError ? (
              <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                沟通洞察加载失败：{copilotLoadError}
              </p>
            ) : null}
            <CopilotInsightCard insights={copilotInsights} />
          </div>
          <div
            style={{
              borderTop: "1px dashed #ddd",
              paddingTop: "0.65rem",
              marginBottom: "0.7rem",
            }}
          >
            <h3 style={{ fontSize: "0.88rem", margin: "0 0 0.4rem" }}>记录本次会话反馈</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
              <label htmlFor="p4-feedback-rating">评分</label>
              <select
                id="p4-feedback-rating"
                value={feedbackRating}
                onChange={(e) => setFeedbackRating(Number(e.target.value))}
                disabled={feedbackSubmitting}
              >
                <option value={5}>5 - 很满意</option>
                <option value={4}>4 - 满意</option>
                <option value={3}>3 - 一般</option>
                <option value={2}>2 - 不满意</option>
                <option value={1}>1 - 很不满意</option>
              </select>
            </div>
            <textarea
              rows={2}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="可选：补充本次会话的主观评价"
              style={{ width: "100%", resize: "vertical", marginBottom: "0.45rem" }}
              disabled={feedbackSubmitting}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
              <button type="button" onClick={onSubmitFeedback} disabled={feedbackSubmitting}>
                {feedbackSubmitting ? "提交中…" : "提交反馈"}
              </button>
              {feedbackResult ? <span style={{ color: "#0d6832" }}>{feedbackResult}</span> : null}
              {feedbackError ? <span style={{ color: "#b00020" }}>{feedbackError}</span> : null}
            </div>
          </div>
          <div
            style={{
              borderTop: "1px dashed #ddd",
              paddingTop: "0.65rem",
            }}
          >
            <h3 style={{ fontSize: "0.88rem", margin: "0 0 0.35rem" }}>
              处理最新画像建议（最小动作）
            </h3>
            {latestPendingSuggestion ? (
              <>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "#555" }}>
                  当前待处理建议：<code>{latestPendingSuggestion.id}</code>
                </p>
                <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={suggestionActionBusy}
                    onClick={() => onHandleLatestSuggestion("accept")}
                  >
                    {suggestionActionBusy ? "处理中…" : "接受最新建议"}
                  </button>
                  <button
                    type="button"
                    disabled={suggestionActionBusy}
                    onClick={() => onHandleLatestSuggestion("dismiss")}
                  >
                    {suggestionActionBusy ? "处理中…" : "忽略最新建议"}
                  </button>
                  {suggestionActionResult ? (
                    <span style={{ color: "#0d6832" }}>{suggestionActionResult}</span>
                  ) : null}
                  {suggestionActionError ? (
                    <span style={{ color: "#b00020" }}>{suggestionActionError}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "#555" }}>
                当前无待处理建议，可在下方查看完整建议列表。
              </p>
            )}
          </div>
        </section>
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
              <button type="button" onClick={() => load("manual")} disabled={loading}>
                刷新
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
