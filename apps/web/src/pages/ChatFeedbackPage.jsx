import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ChatSessionFeedback from "../components/chat/ChatSessionFeedback";
import { submitFeedback } from "../api/feedback";
import { getConversation } from "../api/chat";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { resolveUserId } from "../utils/resolveUserId";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";

const P612_FEEDBACK_SOURCE_VERSION = "p6.12-chat-feedback-structured-v0";

export default function ChatFeedbackPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const matchResultIdParam = searchParams.get("matchResultId")?.trim() || undefined;
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const { isAdmin } = useAdminAccess();

  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

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

  const chatBackHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/chat?${s}` : "/chat";
  }, [conversationId, userId]);

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
    return null;
  }, [conversation, userId]);

  const peerDisplayName = useMemo(() => {
    if (!conversation || !userId) return null;
    const peerId =
      conversation.viewerUserId === userId
        ? conversation.candidateUserId
        : conversation.viewerUserId;
    if (peerId === conversation.viewerUserId) {
      return conversation.viewerNickname?.trim() || peerId;
    }
    return conversation.candidateNickname?.trim() || peerId;
  }, [conversation, userId]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setLoadError(new Error("请从聊天页进入，或带上会话 ID。"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getConversation(conversationId)
      .then((data) => {
        if (!cancelled) setConversation(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setConversation(null);
          setLoadError(e instanceof Error ? e : new Error(String(e)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const onSubmitFeedback = useCallback(
    async (dims) => {
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
        const feedbackAttributionTargetUserId =
          actualConversationPeerUserId || undefined;
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
          ...(feedbackAttributionTargetUserId
            ? { targetUserId: feedbackAttributionTargetUserId }
            : {}),
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
    },
    [
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
    ],
  );

  return (
    <main className="app-themed-content chat-feedback-page">
      <header className="chat-feedback-page__head">
        <Link to={chatBackHref} className="chat-feedback-page__back">
          ← 返回聊天
        </Link>
        <h1 className="chat-page__title">聊后反馈</h1>
        <p className="chat-page__lead">
          {peerDisplayName
            ? `和 ${peerDisplayName} 聊得怎么样？点选即可，不必写长文。`
            : "选一下感受，帮助我们改进匹配与聊天体验。"}
        </p>
      </header>

      {loading ? <LoadingState label="加载会话…" /> : null}
      {loadError ? (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage(loadError.message)}
        </p>
      ) : null}

      {!loading && conversationId && userId && !loadError ? (
        <div
          className="chat-feedback-form"
          data-m65-feedback-target-user-id={actualConversationPeerUserId || undefined}
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
            showAdvanced={isAdmin}
          />
        </div>
      ) : null}
    </main>
  );
}
