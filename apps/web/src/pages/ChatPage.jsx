import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listMyFriends } from "../api/friends";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import ChatSummaryCard from "../components/chat/ChatSummaryCard";
import ChatSessionFeedback from "../components/chat/ChatSessionFeedback";
import CopilotInsightCard from "../components/copilot/CopilotInsightCard";
import ProfileSuggestionCard from "../components/profile/ProfileSuggestionCard";
import { normalizeP6ReviewSummary } from "../components/profile/P6ReviewSummary.helpers.js";
import P6ReviewSummary, { P6ProposedPatchDetails } from "../components/profile/P6ReviewSummary.jsx";
import { useAdminAccess } from "../hooks/useAdminAccess";
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
import { toFriendlyUserMessage } from "../utils/friendlyErrors";

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
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;
  /** M6.6-C1：与 FinalMatchPage handoff query 对齐；不参与发消息或改会话。 */
  const expectedPeerUserId = useMemo(
    () => searchParams.get("finalMatchPeerUserId")?.trim() || null,
    [searchParams],
  );
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const navigate = useNavigate();
  const {
    ensureConversationError,
    shouldHoldForConversationBootstrap,
    showFriendPicker,
  } = useEnsureConversationInUrl(searchParams);

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState(null);

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

  /** M6.6-C1：会话中的对方 userId（API `peerUserId` 或从 viewer/candidate 推导）。 */
  const actualConversationPeerUserId = useMemo(() => {
    if (!conversation || !userId) return null;
    const fromApi =
      typeof conversation.peerUserId === "string" ? conversation.peerUserId.trim() : "";
    if (fromApi) return fromApi;
    if (conversation.viewerUserId === userId) {
      const s =
        typeof conversation.candidateUserId === "string"
          ? conversation.candidateUserId.trim()
          : "";
      return s === "" ? null : s;
    }
    if (conversation.candidateUserId === userId) {
      const s =
        typeof conversation.viewerUserId === "string"
          ? conversation.viewerUserId.trim()
          : "";
      return s === "" ? null : s;
    }
    const s =
      typeof conversation.candidateUserId === "string"
        ? conversation.candidateUserId.trim()
        : "";
    return s === "" ? null : s;
  }, [conversation, userId]);

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

  useEffect(() => {
    if (!showFriendPicker || !userId) {
      setFriends([]);
      setFriendsError(null);
      return;
    }
    let cancelled = false;
    setFriendsLoading(true);
    setFriendsError(null);
    listMyFriends()
      .then((rows) => {
        if (!cancelled) setFriends(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setFriends([]);
          setFriendsError(e instanceof Error ? e : new Error(String(e)));
        }
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showFriendPicker, userId]);

  const openChatWithFriend = useCallback(
    (peerUserId) => {
      if (!userId || !peerUserId) return;
      const q = new URLSearchParams();
      q.set("userId", userId);
      q.set("peerUserId", peerUserId);
      navigate(`/chat?${q.toString()}`);
    },
    [userId, navigate],
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
      setError(new Error("请先从聊天页选择一位好友，再查看本页内容。"));
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
      setError(new Error("会话信息不完整，请从聊天页重新进入。"));
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
  const getUserDisplayName = useCallback(
    (id) => {
      if (!conversation || !id) return id || "未知用户";
      if (id === conversation.viewerUserId) {
        return conversation.viewerNickname?.trim() || conversation.viewerUserId;
      }
      if (id === conversation.candidateUserId) {
        return (
          conversation.candidateNickname?.trim() || conversation.candidateUserId
        );
      }
      return id;
    },
    [conversation],
  );
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
    if (!conversationId) return "请先开始一段对话";
    if (profileCompletionSuggestBusy) return "正在根据聊天整理建议…";
    if (hasP6ChatPendingForThisConversation) return "你还有一条建议待确认，处理完再生成新的";
    if (profileCompletionNoMessagesBlock) return "先聊几句再生成建议，效果会更好";
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

  const onSubmitFeedback = useCallback(async (dims) => {
    if (!conversationId || !userId || feedbackSubmitting) return;
    setFeedbackError(null);
    setFeedbackResult(null);
    setFeedbackSubmitting(true);
    try {
      const derived = dims ?? {
        continueIntent: feedbackContinueIntent,
        comfortLevel: feedbackComfortLevel,
        replyQuality: feedbackReplyQuality,
        safetyFeeling: feedbackSafetyFeeling,
        awkwardness: feedbackAwkwardness,
      };
      setFeedbackContinueIntent(derived.continueIntent);
      setFeedbackComfortLevel(derived.comfortLevel);
      setFeedbackReplyQuality(derived.replyQuality);
      setFeedbackSafetyFeeling(derived.safetyFeeling);
      setFeedbackAwkwardness(derived.awkwardness);
      /** M6.6-C3：归因始终为当前会话对象（= actual peer）；handoff mismatch 时不写入 expected。 */
      const feedbackAttributionTargetUserId = actualConversationPeerUserId || undefined;
      const structuredPayload = {
        schemaVersion: 1,
        kind: "p6.12_conversation_v0",
        conversationId,
        overallRating: feedbackRating,
        continueIntent: derived.continueIntent,
        comfortLevel: derived.comfortLevel,
        replyQuality: derived.replyQuality,
        safetyFeeling: derived.safetyFeeling,
        awkwardness: derived.awkwardness,
        ...(matchResultIdParam ? { matchResultId: matchResultIdParam } : {}),
        ...(feedbackAttributionTargetUserId ? { targetUserId: feedbackAttributionTargetUserId } : {}),
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
      setFeedbackResult("谢谢你的反馈，已记录");
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
    actualConversationPeerUserId,
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
    /** M6.6-C4：进入 Copilot 时透传 Final Match handoff，便于 CopilotPage 比对。 */
    if (expectedPeerUserId) {
      q.set("finalMatchPeerUserId", expectedPeerUserId);
    }
    return `/copilot?${q.toString()}`;
  }, [conversationId, userId, expectedPeerUserId]);

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

  const peerDisplayName = useMemo(() => {
    if (!conversation || !userId) return null;
    const peerId =
      conversation.viewerUserId === userId
        ? conversation.candidateUserId
        : conversation.viewerUserId;
    return getUserDisplayName(peerId);
  }, [conversation, userId]);

  return (
    <div className="app-themed-content chat-page">
      <h1 className="chat-page__title">聊天</h1>
      <p className="chat-page__lead">
        先选好友或直接发消息；想回顾聊天、看建议或留个反馈，可展开下方「聊天助手」。
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
        theme="dark"
        navOnly
        showIdentifierDetails={showDebug}
        showFreshnessMeta={showDebug}
        freshnessHint={freshnessHint}
        lastRefreshedAt={lastRefreshedAt}
        refreshSource={refreshSource}
      />

      {showFriendPicker ? (
        <section className="chat-panel" aria-label="选择好友">
          <h2 className="chat-panel__title">选择好友聊天</h2>
          <p className="chat-panel__hint">
            匹配成功后会自动加为好友。从列表选一位即可进入同一条会话（双方消息互通）。
          </p>
          {friendsLoading ? <LoadingState label="加载好友…" /> : null}
          {friendsError ? (
            <p className="chat-status-err" style={{ margin: "0 0 0.5rem" }} role="alert">
              {friendsError.message}
            </p>
          ) : null}
          {!friendsLoading && !friendsError && friends.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              暂无好友。完成一次匹配后会出现在这里；也可从
              {" "}
              <Link to={`/final-match?userId=${encodeURIComponent(userId || "")}`}>最终结果</Link>
              {" "}
              进入聊天。
            </p>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {friends.map((f) => (
              <li key={f.friendUserId}>
                <button type="button" className="chat-friend-btn" onClick={() => openChatWithFriend(f.friendUserId)}>
                  {f.nickname || f.friendUserId}
                  {f.source === "match_auto" ? (
                    <span className="chat-friend-btn__tag">匹配好友</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shouldHoldForConversationBootstrap && (
        <LoadingState label="正在准备会话…" />
      )}
      {ensureConversationError ? (
        <p className="chat-status-err" role="alert">
          {ensureConversationError.message}
        </p>
      ) : null}
      {loading && <LoadingState label="加载对话…" />}
      {error && (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage(error.message)}
        </p>
      )}

      {!loading && !error && conversation ? (
        <section className="chat-thread-panel">
          {fromFinalMatchHandoff && rhythmRecommendedHandoff && !rhythmHandoffDismissed ? (
            <div className="chat-rhythm-banner" aria-label="聊天节奏建议">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                <h2>开场小提示</h2>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1 px-2"
                  onClick={() => setRhythmHandoffDismissed(true)}
                >
                  收起
                </button>
              </div>
              <p style={{ margin: "0.45rem 0 0.55rem", fontSize: "0.86rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
                从轻松话题开始就好，感受对方回应是否自然，再慢慢深入。
              </p>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
                点一下填入输入框（不会自动发送）
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {["同城周末通常怎么安排？", "最近一件让你开心的小事？", "你平时更喜欢怎样的聊天节奏？"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="chat-topic-chip"
                    onClick={() => setContent((prev) => (prev.trim() ? `${prev.trim()}\n${t}` : t))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="chat-thread-header">
            {peerDisplayName ? (
              <p className="chat-thread-header__who">
                正在与 <strong>{peerDisplayName}</strong> 聊天
              </p>
            ) : null}
            {showDebug && handoffPeerMismatch ? (
              <p className="relationship-timeline-debug" style={{ marginTop: "0.5rem" }}>
                handoff 与当前会话不一致（仅管理员调试可见）
              </p>
            ) : null}
          </div>
          <div className="chat-messages">
            {messages.length === 0 ? (
              <p style={{ margin: 0, color: "rgba(255,255,255,0.45)" }}>还没有消息，发一句打个招呼吧</p>
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
                    <div className={`chat-bubble ${mine ? "chat-bubble--mine" : "chat-bubble--theirs"}`}>
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="chat-composer">
            <textarea
              className="input-glass"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="输入消息…"
            />
            <div className="chat-composer__actions">
              <button
                type="button"
                className="btn-primary text-sm py-2.5 px-5"
                onClick={onSend}
                disabled={sending || !userId || !conversationId || content.trim().length === 0}
              >
                {sending ? "发送中…" : "发送"}
              </button>
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-4"
                onClick={() => load("manual")}
                disabled={loading}
              >
                刷新消息
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {conversationId ? (
        <details className="chat-more-tools">
          <summary>聊天助手：摘要、建议与反馈</summary>
          <div className="chat-more-tools__body">
          {showDebug ? (
          <div className="chat-workflow-grid">
            {workflowSteps.map((step) => (
              <div key={step.key} className="chat-workflow-step">
                <div className="chat-workflow-step__label">{step.label}</div>
                <div
                  className={`chat-workflow-step__status${
                    step.status === "失败"
                      ? " chat-workflow-step__status--err"
                      : step.status === "已就绪" ||
                          step.status === "已提交" ||
                          step.status === "已处理"
                        ? " chat-workflow-step__status--ok"
                        : ""
                  }`}
                >
                  {step.status}
                </div>
              </div>
            ))}
          </div>
          ) : null}
          <div style={{ marginBottom: "0.85rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "rgba(255,255,255,0.55)" }}>
              聊了一会儿后，可以看看系统整理的对话摘要（仅自己可见）。
            </p>
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
                className="btn-ghost text-sm py-2 px-3"
                onClick={onGenerateSummary}
                disabled={summaryGenerating}
              >
                {summaryGenerating ? "整理中…" : "更新对话摘要"}
              </button>
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-3"
                onClick={() => setSummaryRetryNonce((n) => n + 1)}
                disabled={summaryGenerating}
              >
                刷新
              </button>
              {summaryActionOk ? (
                <span className="chat-status-ok" role="status">
                  {summaryActionOk}
                </span>
              ) : null}
              {summaryActionError ? (
                <span className="chat-status-err" role="alert">
                  {summaryActionError}
                </span>
              ) : null}
            </div>
            {summaryLoadError ? (
              <p className="chat-status-err" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                会话摘要加载失败：{summaryLoadError}
              </p>
            ) : null}
            <ChatSummaryCard
              summary={conversationSummary}
              variant="dark"
              showTechnicalMeta={showDebug}
            />
            {showDebug ? (
              <div className="chat-divider">
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <button type="button" className="btn-ghost text-sm py-2 px-3" onClick={onFetchSummaryAi} disabled={summaryAiLoading}>
                    {summaryAiLoading ? "拉取中…" : "拉取 AI 摘要（试点）"}
                  </button>
                  <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)" }}>
                    调试：独立接口，不写入持久化。
                  </span>
                </div>
                {summaryAiError ? (
                  <p className="chat-status-err" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                    AI 摘要请求失败：{summaryAiError}
                  </p>
                ) : null}
                {summaryAiResult ? (
                  <ChatSummaryCard
                    summary={{
                      ...summaryAiResult,
                      persisted: false,
                    }}
                    variant="dark"
                    footerNote="P6.5 AI 摘要试点（调试可见）。"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <div style={{ marginBottom: "0.85rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-3"
                onClick={() => setCopilotRetryNonce((n) => n + 1)}
              >
                刷新建议
              </button>
            </div>
            {copilotLoadError ? (
              <p className="chat-status-err" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                暂时无法加载聊天建议，稍后再试
              </p>
            ) : null}
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.78rem", lineHeight: 1.5, color: "rgba(255,255,255,0.5)" }}>
              根据你们目前的聊天记录生成，不会代替你发消息。
            </p>
            <CopilotInsightCard
              insights={copilotInsights}
              variant="dark"
              showTechnicalMeta={showDebug}
            />
          </div>
          <div
            data-m65-feedback-target-user-id={actualConversationPeerUserId || undefined}
            className="chat-feedback-form"
          >
            <ChatSessionFeedback
              overallRating={feedbackRating}
              onOverallRatingChange={setFeedbackRating}
              continueIntent={feedbackContinueIntent}
              onContinueIntentChange={setFeedbackContinueIntent}
              comment={feedbackComment}
              onCommentChange={setFeedbackComment}
              submitting={feedbackSubmitting}
              resultMessage={feedbackResult}
              errorMessage={feedbackError}
              onSubmit={onSubmitFeedback}
              showAdvanced={showDebug}
            />
          </div>
          <div className="chat-divider">
            <h3 style={{ fontSize: "0.88rem", margin: "0 0 0.35rem", color: "#fff" }}>
              完善我的资料（可选）
            </h3>
            <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>
              根据聊天内容生成问卷补充建议，需要你确认后才会写入资料。
            </p>
            {profileCompletionContextLine ? (
              <p className="chat-status-warn" style={{ margin: "0 0 0.4rem", fontSize: "0.75rem" }}>
                {profileCompletionContextLine}
              </p>
            ) : null}
            {pendingP6ForThisConversation ? (
              <div style={{ margin: "0 0 0.5rem" }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#fff", marginBottom: 6 }}>
                  待你确认的建议
                </div>
                {pendingP6ReviewModel ? (
                  <P6ReviewSummary model={pendingP6ReviewModel} compact />
                ) : (
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>
                    展开下方可查看具体建议内容。
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
                className="btn-ghost text-sm py-2 px-3"
                onClick={onGenerateProfileCompletionSuggestion}
                disabled={profileCompletionButtonDisabled}
              >
                {profileCompletionSuggestBusy
                  ? "生成中…"
                  : "根据聊天生成资料建议"}
              </button>
              {profileCompletionSuggestOk ? (
                <span className="chat-status-ok" style={{ fontSize: "0.8rem" }}>
                  {profileCompletionSuggestOk}
                </span>
              ) : null}
              {profileCompletionSuggestErr ? (
                <span className="chat-status-err" style={{ fontSize: "0.8rem" }} role="alert">
                  {profileCompletionSuggestErr}
                </span>
              ) : null}
            </div>
            {latestPendingSuggestion ? (
              <>
                {showDebug ? (
                  <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
                    当前待处理建议：<code>{latestPendingSuggestion.id}</code>
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-ghost text-sm py-2 px-3"
                    disabled={suggestionActionBusy}
                    onClick={() => onHandleLatestSuggestion("accept")}
                  >
                    {suggestionActionBusy ? "处理中…" : "采纳"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-sm py-2 px-3"
                    disabled={suggestionActionBusy}
                    onClick={() => onHandleLatestSuggestion("dismiss")}
                  >
                    {suggestionActionBusy ? "处理中…" : "暂不采纳"}
                  </button>
                  {suggestionActionResult ? (
                    <span className="chat-status-ok">{suggestionActionResult}</span>
                  ) : null}
                  {suggestionActionError ? (
                    <span className="chat-status-err">{suggestionActionError}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)" }}>
                暂无待处理建议；完整列表见下方。
              </p>
            )}
          </div>
          <ProfileSuggestionCard
            suggestions={profileSuggestions}
            loadError={profileSuggestionsError}
            onRefresh={loadProfileSuggestions}
            variant="dark"
          />
          </div>
        </details>
      ) : null}
    </div>
  );
}
