import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listMyFriends } from "../api/friends";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import ChatAssistantSidebar from "../components/chat/ChatAssistantSidebar";
import ChatCompanionPanel from "../components/chat/ChatCompanionPanel";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { useEnsureConversationInUrl } from "../hooks/useEnsureConversationInUrl";
import { resolveUserId } from "../utils/resolveUserId";
import { getCopilotInsights } from "../api/copilot";
import {
  generateConversationSummary,
  getConversation,
  getConversationSummary,
  sendMessage,
} from "../api/chat";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";

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
  const [p2RefreshKey, setP2RefreshKey] = useState(0);
  const [summaryRetryNonce, setSummaryRetryNonce] = useState(0);
  const [copilotRetryNonce, setCopilotRetryNonce] = useState(0);
  const [summaryLoadError, setSummaryLoadError] = useState(null);
  const [copilotLoadError, setCopilotLoadError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [refreshSource, setRefreshSource] = useState("unknown");
  /** M5.5-Chat-R2A: optional rhythm hint from Final Match handoff (dismissible). */
  const [rhythmHandoffDismissed, setRhythmHandoffDismissed] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(() =>
    typeof window !== "undefined"
      ? !window.matchMedia("(min-width: 900px)").matches
      : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => {
      setAssistantCollapsed((prev) => {
        if (mq.matches) return prev;
        return true;
      });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
  const onRefreshCompanion = useCallback(() => {
    setSummaryRetryNonce((n) => n + 1);
    setCopilotRetryNonce((n) => n + 1);
  }, []);

  const feedbackHref = useMemo(() => {
    if (!conversationId) return null;
    const q = new URLSearchParams();
    q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    if (matchResultIdParam) q.set("matchResultId", matchResultIdParam);
    return `/chat/feedback?${q.toString()}`;
  }, [conversationId, userId, matchResultIdParam]);

  const accountProfileHref = useMemo(() => {
    const q = new URLSearchParams();
    if (userId) q.set("userId", userId);
    if (conversationId) q.set("conversationId", conversationId);
    const s = q.toString();
    return s ? `/account?${s}` : "/account";
  }, [userId, conversationId]);

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
      <p className="chat-page__lead">选好友发消息；需要时展开右侧「小记」看看聊到哪了。</p>
      {showDebug ? (
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
          showIdentifierDetails
          showFreshnessMeta
          freshnessHint={freshnessHint}
          lastRefreshedAt={lastRefreshedAt}
          refreshSource={refreshSource}
        />
      ) : null}

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
        <div
          className={`chat-layout${assistantCollapsed ? " chat-layout--aside-collapsed" : ""}`}
        >
          <section className="chat-thread-panel chat-layout__main">
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
              <div className="chat-thread-header__actions">
                {conversationId ? (
                  <button
                    type="button"
                    className="btn-ghost text-sm py-2 px-3"
                    onClick={() => setAssistantCollapsed((c) => !c)}
                  >
                    {assistantCollapsed ? "展开小记" : "收起小记"}
                  </button>
                ) : null}
                {feedbackHref ? (
                  <Link to={feedbackHref} className="btn-ghost text-sm py-2 px-3 no-underline">
                    聊后反馈
                  </Link>
                ) : null}
                <Link to={timelineHref} className="btn-ghost text-sm py-2 px-3 no-underline">
                  时间线
                </Link>
              </div>
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
              {feedbackHref ? (
                <p className="chat-composer__feedback">
                  <Link to={feedbackHref} className="chat-composer__feedback-link">
                    聊后反馈
                  </Link>
                  <span className="chat-composer__feedback-hint">
                    点选心情即可，对方看不到
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          {conversationId ? (
            <ChatAssistantSidebar
              collapsed={assistantCollapsed}
              onCollapsedChange={setAssistantCollapsed}
              footer={
                <nav className="chat-aside__links" aria-label="更多">
                  {feedbackHref ? (
                    <Link to={feedbackHref} className="chat-aside__link--emph">
                      聊后反馈
                    </Link>
                  ) : null}
                  <Link to={accountProfileHref}>画像建议</Link>
                  <Link to={copilotFullHref}>详细洞察</Link>
                  <Link to={timelineHref}>时间线</Link>
                </nav>
              }
            >
              {summaryActionOk ? (
                <p className="chat-status-ok chat-companion__banner" role="status">
                  {summaryActionOk}
                </p>
              ) : null}
              {summaryActionError ? (
                <p className="chat-status-err chat-companion__banner" role="alert">
                  {summaryActionError}
                </p>
              ) : null}
              <ChatCompanionPanel
                peerName={peerDisplayName}
                summary={conversationSummary}
                summaryLoadError={summaryLoadError}
                summaryGenerating={summaryGenerating}
                onGenerateSummary={onGenerateSummary}
                onRefreshAll={onRefreshCompanion}
                insights={copilotInsights}
                copilotLoadError={copilotLoadError}
                showTechnicalMeta={showDebug}
                feedbackHref={feedbackHref}
              />
            </ChatAssistantSidebar>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
