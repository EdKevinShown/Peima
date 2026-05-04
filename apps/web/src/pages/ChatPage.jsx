import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import ChatSummaryCard from "../components/chat/ChatSummaryCard";
import CopilotInsightCard from "../components/copilot/CopilotInsightCard";
import ProfileSuggestionCard from "../components/profile/ProfileSuggestionCard";
import { normalizeP6ReviewSummary } from "../components/profile/P6ReviewSummary.helpers.js";
import P6ReviewSummary, { P6ProposedPatchDetails } from "../components/profile/P6ReviewSummary.jsx";
import { useEnsureConversationInUrl } from "../hooks/useEnsureConversationInUrl";
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
  postProfileCompletionSuggestion,
  ProfileCompletionSuggestionRequestError,
  sendMessage,
} from "../api/chat";
import { getSummaryAi } from "../api/summary-ai";

/** P6.8 chat 生成落库的 sourceVersion（与后端一致）。 */
const P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION =
  "p6.8-profile-completion-chat-ai-v1";

/** P6.12 structured feedback（与 `docs/P6/P6.12-chat-feedback-structured-payload-v0.md` 一致）。 */
const P612_FEEDBACK_SOURCE_VERSION = "p6.12-chat-feedback-structured-v0";

/** M6.6-C1：debug 用脱敏，不展示完整 userId。 */
function maskPeerIdForDebug(id) {
  if (id == null || typeof id !== "string") return "—";
  const t = id.trim();
  if (t.length === 0) return "—";
  if (t.length <= 8) return "…";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const matchResultIdParam =
    searchParams.get("matchResultId")?.trim() || undefined;
  const fromFinalMatchHandoff = searchParams.get("fromFinalMatch") === "1";
  const rhythmRecommendedHandoff = searchParams.get("rhythmRecommended") === "1";
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  /** M6.6-C1：与 FinalMatchPage handoff query 对齐；不参与发消息或改会话。 */
  const expectedPeerUserId = useMemo(
    () => searchParams.get("finalMatchPeerUserId")?.trim() || null,
    [searchParams],
  );
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const { ensureConversationError, shouldHoldForConversationBootstrap } =
    useEnsureConversationInUrl(searchParams);

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
  const [feedbackContinueIntent, setFeedbackContinueIntent] = useState(3);
  const [feedbackComfortLevel, setFeedbackComfortLevel] = useState(3);
  const [feedbackReplyQuality, setFeedbackReplyQuality] = useState(3);
  const [feedbackSafetyFeeling, setFeedbackSafetyFeeling] = useState(3);
  const [feedbackAwkwardness, setFeedbackAwkwardness] = useState(3);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);
  const [suggestionActionBusy, setSuggestionActionBusy] = useState(false);
  const [suggestionActionError, setSuggestionActionError] = useState(null);
  const [suggestionActionResult, setSuggestionActionResult] = useState(null);
  const [profileCompletionSuggestBusy, setProfileCompletionSuggestBusy] = useState(false);
  const [profileCompletionSuggestOk, setProfileCompletionSuggestOk] = useState(null);
  const [profileCompletionSuggestErr, setProfileCompletionSuggestErr] = useState(null);
  /** M5.5-Chat-R2A: optional rhythm hint from Final Match handoff (dismissible). */
  const [rhythmHandoffDismissed, setRhythmHandoffDismissed] = useState(false);

  /** M6.6-C1：会话中的对方 userId（与 `Conversation.candidateUserId` 一致）；无会话数据时为 null。 */
  const actualConversationPeerUserId = useMemo(() => {
    if (!conversation || typeof conversation.candidateUserId !== "string") return null;
    const s = conversation.candidateUserId.trim();
    return s === "" ? null : s;
  }, [conversation]);

  /**
   * M6.6-C1：expected 缺失、actual 缺失、或二者相同 → true；二者均存在且不同 → false。
   * 不阻止发消息、不切换会话。
   */
  const handoffPeerMatched = useMemo(
    () =>
      !expectedPeerUserId ||
      !actualConversationPeerUserId ||
      expectedPeerUserId === actualConversationPeerUserId,
    [expectedPeerUserId, actualConversationPeerUserId],
  );

  const handoffPeerMismatch = useMemo(
    () =>
      Boolean(
        expectedPeerUserId &&
          actualConversationPeerUserId &&
          expectedPeerUserId !== actualConversationPeerUserId,
      ),
    [expectedPeerUserId, actualConversationPeerUserId],
  );

  const load = useCallback(async (source = "manual") => {
    if (!conversationId) {
      if (shouldHoldForConversationBootstrap) {
        setError(null);
        setConversation(null);
        setLastRefreshedAt(null);
        setRefreshSource("unknown");
        return;
      }
      if (userId && ensureConversationError) {
        setError(ensureConversationError);
        setConversation(null);
        setLastRefreshedAt(null);
        setRefreshSource("unknown");
        return;
      }
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
  }, [
    conversationId,
    userId,
    ensureConversationError,
    shouldHoldForConversationBootstrap,
  ]);

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

  const hasP6ChatPendingForThisConversation = useMemo(() => {
    if (!conversationId) return false;
    return (profileSuggestions ?? []).some(
      (s) =>
        s.status === "pending" &&
        s.sourceVersion === P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION &&
        s.sourceConversationId === conversationId,
    );
  }, [profileSuggestions, conversationId]);

  const pendingP6ForThisConversation = useMemo(() => {
    if (!conversationId) return null;
    return (
      (profileSuggestions ?? []).find(
        (s) =>
          s.status === "pending" &&
          s.sourceVersion === P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION &&
          s.sourceConversationId === conversationId,
      ) ?? null
    );
  }, [profileSuggestions, conversationId]);

  const pendingP6ReviewModel = useMemo(() => {
    if (!pendingP6ForThisConversation) return null;
    return normalizeP6ReviewSummary(pendingP6ForThisConversation);
  }, [pendingP6ForThisConversation]);

  const profileCompletionNoMessagesBlock = useMemo(() => {
    if (!conversationId || !conversation) return false;
    if (!Array.isArray(conversation.messages)) return false;
    return conversation.messages.length === 0;
  }, [conversationId, conversation]);

  const profileCompletionButtonDisabled = useMemo(
    () =>
      !conversationId ||
      profileCompletionSuggestBusy ||
      hasP6ChatPendingForThisConversation ||
      profileCompletionNoMessagesBlock,
    [
      conversationId,
      profileCompletionSuggestBusy,
      hasP6ChatPendingForThisConversation,
      profileCompletionNoMessagesBlock,
    ],
  );

  const profileCompletionContextLine = useMemo(() => {
    if (!conversationId) return "需先进入会话";
    if (profileCompletionSuggestBusy) return "正在生成画像建议";
    if (hasP6ChatPendingForThisConversation) return "已有待处理建议，请先审阅";
    if (profileCompletionNoMessagesBlock) return "建议先发送几条消息再试";
    return null;
  }, [
    conversationId,
    profileCompletionSuggestBusy,
    hasP6ChatPendingForThisConversation,
    profileCompletionNoMessagesBlock,
  ]);

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
      const targetUserId = conversation?.candidateUserId || undefined;
      const structuredPayload = {
        schemaVersion: 1,
        kind: "p6.12_conversation_v0",
        conversationId,
        overallRating: feedbackRating,
        continueIntent: feedbackContinueIntent,
        comfortLevel: feedbackComfortLevel,
        replyQuality: feedbackReplyQuality,
        safetyFeeling: feedbackSafetyFeeling,
        awkwardness: feedbackAwkwardness,
        ...(matchResultIdParam ? { matchResultId: matchResultIdParam } : {}),
        ...(targetUserId ? { targetUserId } : {}),
      };
      await submitFeedback({
        userId,
        subjectKind: "conversation",
        subjectId: conversationId,
        rating: feedbackRating,
        comment: feedbackComment.trim() || undefined,
        tags: ["post_chat_action_hub", "p6.12_structured_v0"],
        sourceType: "rule_based",
        sourceVersion: P612_FEEDBACK_SOURCE_VERSION,
        structuredPayload,
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
    feedbackContinueIntent,
    feedbackComfortLevel,
    feedbackReplyQuality,
    feedbackSafetyFeeling,
    feedbackAwkwardness,
    conversation,
    matchResultIdParam,
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

  const onGenerateProfileCompletionSuggestion = useCallback(async () => {
    if (
      !conversationId ||
      profileCompletionSuggestBusy ||
      hasP6ChatPendingForThisConversation ||
      profileCompletionNoMessagesBlock
    ) {
      return;
    }
    setProfileCompletionSuggestErr(null);
    setProfileCompletionSuggestOk(null);
    setProfileCompletionSuggestBusy(true);
    try {
      await postProfileCompletionSuggestion(conversationId);
      await loadProfileSuggestions();
      setProfileCompletionSuggestOk("已生成待审阅建议");
      window.setTimeout(() => setProfileCompletionSuggestOk(null), 3200);
    } catch (e) {
      if (e instanceof ProfileCompletionSuggestionRequestError) {
        switch (e.status) {
          case 401:
            setProfileCompletionSuggestErr("请先登录后再生成画像建议");
            break;
          case 403:
            setProfileCompletionSuggestErr("你无权为这轮对话生成画像建议");
            break;
          case 409:
            setProfileCompletionSuggestErr("本轮对话已有待处理建议，请先审阅");
            break;
          case 422:
            setProfileCompletionSuggestErr("当前对话暂时无法生成有效画像建议");
            break;
          case 503:
            setProfileCompletionSuggestErr("画像建议生成功能暂未启用");
            break;
          case 502:
            setProfileCompletionSuggestErr("生成失败，请稍后重试");
            break;
          default:
            setProfileCompletionSuggestErr(e.message || "请求失败，请稍后重试");
        }
      } else {
        setProfileCompletionSuggestErr(
          e instanceof Error ? e.message : "请求失败，请稍后重试",
        );
      }
    } finally {
      setProfileCompletionSuggestBusy(false);
    }
  }, [
    conversationId,
    profileCompletionSuggestBusy,
    hasP6ChatPendingForThisConversation,
    profileCompletionNoMessagesBlock,
    loadProfileSuggestions,
  ]);

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

  const myActivityHref = useMemo(() => {
    if (!userId) return "/my-activity";
    return `/my-activity?userId=${encodeURIComponent(userId)}`;
  }, [userId]);

  const freshnessHint =
    "在其他页面查看洞察或时间线后，回到此处发消息前可手动刷新，以同步最新摘要。";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.25rem", color: "#0f172a" }}>聊天</h1>
      <p style={{ margin: "0 0 0.65rem", fontSize: "0.86rem", color: "#64748b", lineHeight: 1.45 }}>
        主操作为输入内容后点<strong>发送</strong>。上方为可选工具入口。
      </p>
      <ConversationContextBar
        pageKey="chat"
        conversationId={conversationId}
        userId={userId}
        chatHref={chatSelfHref}
        copilotHref={copilotFullHref}
        timelineHref={timelineHref}
        activityHref={myActivityHref}
        navVariant="phaseG_subtle"
        freshnessHint={freshnessHint}
        lastRefreshedAt={lastRefreshedAt}
        refreshSource={refreshSource}
      />

      {shouldHoldForConversationBootstrap && (
        <LoadingState label="正在准备会话…" />
      )}
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
            border: "1px dashed #cbd5e1",
            borderRadius: 10,
            background: "#f8fafc",
          }}
          aria-label="聊天后的可选延伸"
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
            可选：摘要与建议
          </h2>
          <p style={{ margin: "0 0 0.65rem", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.45 }}>
            本区为摘要、洞察与资料建议等<strong>可选</strong>能力；时间线、沟通洞察与反馈入口在上方。
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
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
              {handoffPeerMismatch
                ? "最终匹配入口传入对象与当前会话对象不一致，沟通建议仍基于当前会话。"
                : "沟通建议基于当前会话生成。"}
            </p>
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
            <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 0.5rem" }}>
              仅用于改进体验（P6.12 结构化），对方不会看到；与匹配分、排序无关。
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
              <label htmlFor="p4-feedback-rating">总评</label>
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
            {[
              ["续聊意愿", "p612-fi", feedbackContinueIntent, setFeedbackContinueIntent],
              ["舒适度", "p612-cm", feedbackComfortLevel, setFeedbackComfortLevel],
              ["对方回复", "p612-rq", feedbackReplyQuality, setFeedbackReplyQuality],
              ["安全感", "p612-sf", feedbackSafetyFeeling, setFeedbackSafetyFeeling],
              ["尴尬/不自然（越高越尴尬）", "p612-aw", feedbackAwkwardness, setFeedbackAwkwardness],
            ].map(([label, id, value, setVal]) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.35rem",
                }}
              >
                <label htmlFor={id} style={{ minWidth: "9.5rem", fontSize: "0.8rem" }}>
                  {label}
                </label>
                <select
                  id={id}
                  value={value}
                  onChange={(e) => setVal(Number(e.target.value))}
                  disabled={feedbackSubmitting}
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            ))}
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
            <p
              style={{
                margin: "0 0 0.35rem",
                fontSize: "0.75rem",
                color: "#666",
              }}
            >
              生成的是待审阅的问卷维度分支建议，不是人格标签结论。
            </p>
            {profileCompletionContextLine ? (
              <p
                style={{
                  margin: "0 0 0.4rem",
                  fontSize: "0.75rem",
                  color: "#7a4a00",
                }}
              >
                {profileCompletionContextLine}
              </p>
            ) : null}
            {pendingP6ForThisConversation ? (
              <div style={{ margin: "0 0 0.5rem" }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#1e293b",
                    marginBottom: 6,
                  }}
                >
                  本会话画像建议摘要
                </div>
                {pendingP6ReviewModel ? (
                  <P6ReviewSummary model={pendingP6ReviewModel} compact />
                ) : (
                  <p
                    style={{
                      margin: "0 0 0.35rem",
                      fontSize: "0.78rem",
                      color: "#64748b",
                    }}
                  >
                    本建议暂无结构化审阅摘要；请展开下方查看原始补丁。
                  </p>
                )}
                <P6ProposedPatchDetails
                  proposedPatch={pendingP6ForThisConversation.proposedPatch}
                  id={pendingP6ForThisConversation.id}
                />
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "0.45rem",
              }}
            >
              <button
                type="button"
                onClick={onGenerateProfileCompletionSuggestion}
                disabled={profileCompletionButtonDisabled}
              >
                {profileCompletionSuggestBusy
                  ? "生成中…"
                  : "根据本轮对话生成画像建议"}
              </button>
              {profileCompletionSuggestOk ? (
                <span style={{ color: "#0d6832", fontSize: "0.8rem" }}>
                  {profileCompletionSuggestOk}
                </span>
              ) : null}
              {profileCompletionSuggestErr ? (
                <span style={{ color: "#b00020", fontSize: "0.8rem" }} role="alert">
                  {profileCompletionSuggestErr}
                </span>
              ) : null}
            </div>
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
          {fromFinalMatchHandoff && rhythmRecommendedHandoff && !rhythmHandoffDismissed ? (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
              aria-label="聊天节奏建议"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "0.95rem", margin: 0, fontWeight: 600, color: "#0f172a" }}>聊天节奏建议</h2>
                <button
                  type="button"
                  onClick={() => setRhythmHandoffDismissed(true)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#64748b",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    padding: "0.1rem 0.25rem",
                  }}
                >
                  收起
                </button>
              </div>
              <p style={{ margin: "0.45rem 0 0.55rem", fontSize: "0.86rem", color: "#334155", lineHeight: 1.55 }}>
                这次推荐已经结合了基础适配和相处节奏。建议先从轻松话题开始，观察双方回应是否自然，再慢慢深入。
              </p>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>快捷话题（仅填入输入框，不会自动发送）</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {["同城周末通常怎么安排？", "最近一件让你开心的小事？", "你平时更喜欢怎样的聊天节奏？"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setContent((prev) => (prev.trim() ? `${prev.trim()}\n${t}` : t))}
                    style={{
                      fontSize: "0.8rem",
                      padding: "0.35rem 0.55rem",
                      borderRadius: 999,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ padding: "0.75rem 1rem", background: "#fafafa" }}>
            <div
              style={{
                marginBottom: "0.55rem",
                paddingBottom: "0.55rem",
                borderBottom: "1px solid #e5e7eb",
              }}
              aria-label="本页聊天"
            >
              <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#0f172a", marginBottom: "0.35rem" }}>
                本页聊天
              </div>
              {handoffPeerMismatch ? (
                <p
                  role="status"
                  style={{
                    margin: 0,
                    fontSize: "0.84rem",
                    color: "#a16207",
                    lineHeight: 1.55,
                    maxWidth: 520,
                  }}
                >
                  当前聊天对象与最终匹配入口传入对象不一致，本页仍按当前会话继续。
                </p>
              ) : null}
              {isDebugMode && !expectedPeerUserId ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.45 }}>
                  调试：无最终匹配 handoff（未带 finalMatchPeerUserId）。
                </p>
              ) : null}
              {isDebugMode &&
              expectedPeerUserId &&
              actualConversationPeerUserId &&
              handoffPeerMatched ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#15803d", lineHeight: 1.45 }}>
                  调试：最终匹配 handoff 已对齐。
                </p>
              ) : null}
              {isDebugMode && expectedPeerUserId && !actualConversationPeerUserId ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.45 }}>
                  调试：已带 handoff，会话 candidate 尚未加载完成，暂无法比对。
                </p>
              ) : null}
              {isDebugMode && handoffPeerMismatch ? (
                <p
                  style={{
                    margin: "0.35rem 0 0",
                    fontSize: "0.76rem",
                    color: "#64748b",
                    lineHeight: 1.45,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  调试：handoff expected（脱敏）{maskPeerIdForDebug(expectedPeerUserId)} · 会话 actual（脱敏）
                  {maskPeerIdForDebug(actualConversationPeerUserId)}
                </p>
              ) : null}
            </div>
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
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", alignItems: "center" }}>
              <button
                type="button"
                onClick={onSend}
                disabled={sending || !userId || !conversationId || content.trim().length === 0}
                style={{
                  padding: "0.65rem 1.35rem",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 8,
                  background: "#1e293b",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {sending ? "发送中…" : "发送"}
              </button>
              <button
                type="button"
                onClick={() => load("manual")}
                disabled={loading}
                style={{
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.86rem",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  background: "#fff",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                刷新对话
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
