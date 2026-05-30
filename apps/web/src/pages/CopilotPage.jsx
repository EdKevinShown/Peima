import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { useEnsureConversationInUrl } from "../hooks/useEnsureConversationInUrl";
import CopilotInsightCard from "../components/copilot/CopilotInsightCard";
import { getConversation } from "../api/chat";
import { getCopilotInsights } from "../api/copilot";
import { resolveUserId } from "../utils/resolveUserId";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";

/** M6.6-C4：debug 脱敏（与 ChatPage 一致）。 */
function maskPeerIdForDebug(id) {
  if (id == null || typeof id !== "string") return "—";
  const t = id.trim();
  if (t.length === 0) return "—";
  if (t.length <= 8) return "…";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export default function CopilotPage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;
  const expectedPeerUserId = useMemo(
    () => searchParams.get("finalMatchPeerUserId")?.trim() || null,
    [searchParams],
  );
  const { ensureConversationError, shouldHoldForConversationBootstrap } =
    useEnsureConversationInUrl(searchParams);

  const [peerLookup, setPeerLookup] = useState({ status: "unset", id: null });

  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [refreshSource, setRefreshSource] = useState("unknown");
  const [nextRefreshSource, setNextRefreshSource] = useState("initial");

  const chatBackHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    if (expectedPeerUserId) q.set("finalMatchPeerUserId", expectedPeerUserId);
    const s = q.toString();
    return s ? `/chat?${s}` : "/chat";
  }, [conversationId, userId, expectedPeerUserId]);

  const timelineHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    if (expectedPeerUserId) q.set("finalMatchPeerUserId", expectedPeerUserId);
    const s = q.toString();
    return s ? `/chat/timeline?${s}` : "/chat/timeline";
  }, [conversationId, userId, expectedPeerUserId]);

  const copilotSelfHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    if (expectedPeerUserId) q.set("finalMatchPeerUserId", expectedPeerUserId);
    const s = q.toString();
    return s ? `/copilot?${s}` : "/copilot";
  }, [conversationId, userId, expectedPeerUserId]);

  const myActivityHref = useMemo(() => {
    if (!userId) return "/my-activity";
    return `/my-activity?userId=${encodeURIComponent(userId)}`;
  }, [userId]);

  const freshnessHint = "聊天有更新后，可点下方按钮刷新本页建议。";

  useEffect(() => {
    if (!conversationId) {
      setPeerLookup({ status: "unset", id: null });
      return;
    }
    let cancelled = false;
    setPeerLookup({ status: "loading", id: null });
    (async () => {
      try {
        const conv = await getConversation(conversationId);
        if (cancelled) return;
        const raw = conv?.candidateUserId;
        const id =
          typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
        setPeerLookup({ status: "ready", id });
      } catch {
        if (!cancelled) {
          setPeerLookup({ status: "failed", id: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setInsights(null);
      setError(null);
      setLoading(false);
      setLastRefreshedAt(null);
      setRefreshSource("unknown");
      return;
    }
    let cancelled = false;
    const sourceForThisLoad = nextRefreshSource || "initial";
    setLoading(true);
    setError(null);
    setInsights(null);
    (async () => {
      try {
        const data = await getCopilotInsights(conversationId);
        if (!cancelled) {
          setInsights(data?.conversationId ? data : null);
          setLastRefreshedAt(Date.now());
          setRefreshSource(sourceForThisLoad);
          setNextRefreshSource("manual");
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
  }, [conversationId, refreshNonce, nextRefreshSource]);

  const actualConversationPeerUserId =
    peerLookup.status === "ready" ? peerLookup.id : null;
  const handoffPeerMismatch = Boolean(
    expectedPeerUserId &&
      actualConversationPeerUserId &&
      expectedPeerUserId !== actualConversationPeerUserId,
  );

  return (
    <div className="app-themed-content chat-page">
      <h1 className="chat-page__title">聊天建议</h1>
      <p className="chat-page__lead">
        根据你们目前的聊天记录整理参考，不会代替你发消息；想继续聊请回到聊天页。
      </p>

      <ConversationContextBar
        pageKey="copilot"
        conversationId={conversationId}
        userId={userId}
        chatHref={chatBackHref}
        copilotHref={copilotSelfHref}
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

      {conversationId ? (
        <div style={{ marginBottom: "0.95rem" }}>
          <button
            type="button"
            className="btn-ghost text-sm py-2 px-4"
            onClick={() => {
              setNextRefreshSource("manual");
              setRefreshNonce((n) => n + 1);
            }}
            disabled={loading}
          >
            {loading ? "刷新中…" : "刷新建议"}
          </button>
        </div>
      ) : null}

      {showDebug && handoffPeerMismatch ? (
        <p className="relationship-timeline-debug" style={{ marginBottom: "0.65rem" }}>
          handoff 与当前会话不一致 · expected {maskPeerIdForDebug(expectedPeerUserId)} · actual{" "}
          {maskPeerIdForDebug(actualConversationPeerUserId)}
        </p>
      ) : null}

      {shouldHoldForConversationBootstrap ? (
        <LoadingState label="正在准备会话…" />
      ) : null}
      {!conversationId && !shouldHoldForConversationBootstrap ? (
        <p role="status">
          {ensureConversationError ? (
            <>
              {toFriendlyUserMessage(ensureConversationError.message)}
              <br />
              请从 <Link to="/chat">聊天页</Link> 选择好友后再打开本页。
            </>
          ) : (
            <>
              请先从 <Link to="/chat">聊天页</Link> 进入一段对话，再查看聊天建议。
            </>
          )}
        </p>
      ) : null}

      {conversationId && loading ? <LoadingState label="正在整理建议…" /> : null}

      {conversationId && error ? (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage(error.message)}
        </p>
      ) : null}

      {conversationId && !loading && !error && !insights ? (
        <p role="status">
          暂时还没有可参考的建议。回聊天多聊几句，或更新对话摘要后再点「刷新建议」。
        </p>
      ) : null}

      {conversationId && !loading && !error && insights ? (
        <CopilotInsightCard
          insights={insights}
          variant="dark"
          showTechnicalMeta={showDebug}
        />
      ) : null}
    </div>
  );
}
