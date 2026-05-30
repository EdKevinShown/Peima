import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { useEnsureConversationInUrl } from "../hooks/useEnsureConversationInUrl";
import { getConversation, getConversationTimeline } from "../api/chat";
import { resolveUserId } from "../utils/resolveUserId";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";

const TIMELINE_MESSAGE_LIMIT = 20;

/** M6.6-C2：debug 脱敏（与 ChatPage 行为一致；后续可抽 shared helper）。 */
function maskPeerIdForDebug(id) {
  if (id == null || typeof id !== "string") return "—";
  const t = id.trim();
  if (t.length === 0) return "—";
  if (t.length <= 8) return "…";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

const TYPE_LABELS = {
  conversation_opened: "会话开始",
  message_sent: "消息往来",
  summary_snapshot: "摘要快照",
  behavior_signal: "行为信号",
  feedback_on_conversation: "会话反馈",
};

const TYPE_STYLES = {
  conversation_opened: { badgeBg: "rgba(14,165,233,0.2)", badgeColor: "#7dd3fc", dot: "#0ea5e9" },
  message_sent: { badgeBg: "rgba(99,102,241,0.22)", badgeColor: "#c7d2fe", dot: "#6366f1" },
  summary_snapshot: { badgeBg: "rgba(245,158,11,0.2)", badgeColor: "#fcd34d", dot: "#f59e0b" },
  behavior_signal: { badgeBg: "rgba(34,197,94,0.18)", badgeColor: "#86efac", dot: "#22c55e" },
  feedback_on_conversation: { badgeBg: "rgba(236,72,153,0.2)", badgeColor: "#f9a8d4", dot: "#ec4899" },
};

const TECH_DETAIL_RE = /规则生成|非大模型|viewer\s*侧|说明由规则/i;

function timelineTitleForDisplay(item, showDebug) {
  if (showDebug) return item.title;
  if (item.type === "summary_snapshot") return "沟通摘要已更新";
  return item.title;
}

function timelineDetailForDisplay(item, showDebug) {
  const detail = item.detail?.trim();
  if (!detail) return null;
  if (showDebug) return detail;
  if (item.type === "summary_snapshot" || item.type === "behavior_signal") return null;
  if (TECH_DETAIL_RE.test(detail)) return null;
  return detail;
}

/** 普通用户时间线仅展示可理解的互动事件 */
function filterTimelineItemsForViewer(items, showDebug) {
  if (showDebug) return items;
  return items.filter(
    (i) =>
      i.type === "conversation_opened" ||
      i.type === "message_sent" ||
      i.type === "feedback_on_conversation",
  );
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** 与后端 compareTimelineItems 一致：occurredAt 再 id */
function compareTimelineItems(a, b) {
  const t = a.occurredAt.localeCompare(b.occurredAt);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

function mergeTimelineItems(existing, incoming) {
  const map = new Map();
  for (const i of existing) map.set(i.id, i);
  for (const i of incoming) map.set(i.id, i);
  return Array.from(map.values()).sort(compareTimelineItems);
}

/** 后端在 message / behavior_signal 等项的 meta.actorUserId；与当前页 userId 比较 */
function typeLabelWithActorRole(item, currentUserId) {
  const base = TYPE_LABELS[item.type] ?? item.type;
  const actorId = item.meta?.actorUserId;
  if (!actorId || !currentUserId) return base;
  const who = actorId === currentUserId ? "我" : "对方";
  return `${base}（${who}）`;
}

function getTypeStyle(type) {
  return TYPE_STYLES[type] ?? {
    badgeBg: "#e5e7eb",
    badgeColor: "#374151",
    dot: "#9ca3af",
  };
}

function buildTimelineSummary(items) {
  const counts = {
    message_sent: 0,
    summary_snapshot: 0,
    feedback_on_conversation: 0,
    behavior_signal: 0,
  };
  for (const i of items) {
    if (Object.prototype.hasOwnProperty.call(counts, i.type)) {
      counts[i.type] += 1;
    }
  }
  return counts;
}

function inferRelationshipStage(items) {
  if (!items.length) return "尚未形成有效互动";
  const counts = buildTimelineSummary(items);
  if (counts.message_sent === 0) return "会话已建立，尚未进入实质沟通";
  if (counts.message_sent <= 3) return "初始破冰阶段";
  if (counts.message_sent <= 10) return "持续沟通阶段";
  if (counts.feedback_on_conversation > 0 || counts.summary_snapshot > 1) {
    return "稳定推进阶段";
  }
  return "关系逐步升温中";
}

export default function RelationshipTimelinePage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;
  /** M6.6-C2：与 FinalMatchPage 跳转 query 对齐；不参与时间线拉取参数。 */
  const expectedTimelinePeerUserId = useMemo(
    () => searchParams.get("finalMatchPeerUserId")?.trim() || null,
    [searchParams],
  );
  const { ensureConversationError, shouldHoldForConversationBootstrap } =
    useEnsureConversationInUrl(searchParams);

  /** M6.6-C2：用既有 GET conversation 推导会话对方，不新增 timeline API。 */
  const [peerLookup, setPeerLookup] = useState({ status: "unset", id: null });

  const [mergedItems, setMergedItems] = useState([]);
  const [messagePagination, setMessagePagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [refreshSource, setRefreshSource] = useState("unknown");

  const chatBackHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/chat?${s}` : "/chat";
  }, [conversationId, userId]);

  const copilotHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/copilot?${s}` : "/copilot";
  }, [conversationId, userId]);

  const timelineSelfHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/chat/timeline?${s}` : "/chat/timeline";
  }, [conversationId, userId]);

  const myActivityHref = useMemo(() => {
    if (!userId) return "/my-activity";
    return `/my-activity?userId=${encodeURIComponent(userId)}`;
  }, [userId]);

  useEffect(() => {
    if (!conversationId) {
      setPeerLookup({ status: "unset", id: null });
      setMergedItems([]);
      setMessagePagination(null);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      setLastRefreshedAt(null);
      setRefreshSource("unknown");
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

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setMergedItems([]);
    setMessagePagination(null);
    (async () => {
      try {
        const res = await getConversationTimeline(conversationId, {
          messageLimit: TIMELINE_MESSAGE_LIMIT,
        });
        if (!cancelled) {
          setMergedItems(Array.isArray(res.items) ? res.items : []);
          setMessagePagination(
            res.messagePagination ?? {
              skip: 0,
              limit: TIMELINE_MESSAGE_LIMIT,
              hasMore: false,
            },
          );
          setLastRefreshedAt(Date.now());
          setRefreshSource("initial");
        }
      } catch (e) {
        if (!cancelled) {
          setMergedItems([]);
          setMessagePagination(null);
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

  const onLoadMoreMessages = useCallback(async () => {
    if (!conversationId || !messagePagination || loadingMore) return;
    const nextSkip = messagePagination.skip + messagePagination.limit;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await getConversationTimeline(conversationId, {
        messageSkip: nextSkip,
        messageLimit: messagePagination.limit,
      });
      setMergedItems((prev) => mergeTimelineItems(prev, res.items ?? []));
      setMessagePagination(
        res.messagePagination ?? {
          skip: nextSkip,
          limit: messagePagination.limit,
          hasMore: false,
        },
      );
      setLastRefreshedAt(Date.now());
      setRefreshSource("manual");
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messagePagination, loadingMore]);

  const showLoadMore =
    Boolean(conversationId) &&
    messagePagination?.hasMore === true &&
    !loading;

  const actualTimelinePeerUserId =
    peerLookup.status === "ready" ? peerLookup.id : null;

  const timelineHandoffMatched = useMemo(
    () =>
      !expectedTimelinePeerUserId ||
      !actualTimelinePeerUserId ||
      expectedTimelinePeerUserId === actualTimelinePeerUserId,
    [expectedTimelinePeerUserId, actualTimelinePeerUserId],
  );

  const timelineHandoffMismatch = useMemo(
    () =>
      Boolean(
        expectedTimelinePeerUserId &&
          actualTimelinePeerUserId &&
          expectedTimelinePeerUserId !== actualTimelinePeerUserId,
      ),
    [expectedTimelinePeerUserId, actualTimelinePeerUserId],
  );

  const items = mergedItems;
  const visibleItems = useMemo(
    () => filterTimelineItemsForViewer(items, showDebug),
    [items, showDebug],
  );
  const timelineSummary = useMemo(() => buildTimelineSummary(items), [items]);
  const relationshipStage = useMemo(
    () => inferRelationshipStage(items),
    [items],
  );

  return (
    <div className="app-themed-content relationship-timeline-page">
      <h1 className="text-lg font-semibold text-white mb-1">关系时间线</h1>
      <p className="relationship-timeline-page__lead">看看你们从开始聊天到现在，大致走到了哪一步</p>

      <ConversationContextBar
        pageKey="timeline"
        conversationId={conversationId}
        userId={userId}
        chatHref={chatBackHref}
        copilotHref={copilotHref}
        timelineHref={timelineSelfHref}
        activityHref={myActivityHref}
        navVariant="phaseG_subtle"
        theme="dark"
        navOnly
        showIdentifierDetails={showDebug}
        showFreshnessMeta={showDebug}
        lastRefreshedAt={lastRefreshedAt}
        refreshSource={refreshSource}
      />

      {shouldHoldForConversationBootstrap ? (
        <LoadingState label="正在准备会话…" />
      ) : null}
      {!conversationId && !shouldHoldForConversationBootstrap ? (
        <p role="status">
          {ensureConversationError ? (
            <>
              {toFriendlyUserMessage(ensureConversationError.message)}
              <br />
              请从 <Link to="/chat">聊天页</Link> 选择好友后再打开时间线。
            </>
          ) : (
            <>请先从 <Link to="/chat">聊天页</Link> 进入一段对话，再查看关系时间线。</>
          )}
        </p>
      ) : null}

      {conversationId && loading ? (
        <LoadingState label="加载时间线…" />
      ) : null}

      {conversationId && error ? (
        <p className="text-rose-300/90" role="alert">
          时间线加载失败：{error.message}
        </p>
      ) : null}

      {conversationId && !loading && !error && visibleItems.length === 0 ? (
        <p role="status">还没有可回顾的记录。去聊几句，再回来看看你们的进展吧。</p>
      ) : null}

      {conversationId && !loading && !error && visibleItems.length > 0 ? (
        <>
          <section
            className="onboarding-soft-panel relationship-timeline-overview"
            aria-label="关系进展概览"
          >
            <div className="relationship-timeline-overview__title">关系进展概览</div>
            {showDebug && timelineHandoffMismatch ? (
              <p className="relationship-timeline-overview__warn" role="status">
                handoff 与当前会话不一致（管理员调试）
              </p>
            ) : null}
            <p className="relationship-timeline-overview__stage">当前阶段：{relationshipStage}</p>
            <p className="relationship-timeline-overview__note">
              {showDebug
                ? "调试模式：展示全部事件类型与明细。"
                : "记录的是你和 TA 之间值得留意的互动节点。"}
            </p>
            <div className="relationship-timeline-stats">
              <span className="relationship-timeline-stat relationship-timeline-stat--message">
                往来 {timelineSummary.message_sent} 条
              </span>
              {timelineSummary.feedback_on_conversation > 0 ? (
                <span className="relationship-timeline-stat relationship-timeline-stat--feedback">
                  你的反馈 {timelineSummary.feedback_on_conversation} 次
                </span>
              ) : null}
              {showDebug && timelineSummary.summary_snapshot > 0 ? (
                <span className="relationship-timeline-stat relationship-timeline-stat--summary">
                  摘要 {timelineSummary.summary_snapshot}
                </span>
              ) : null}
              {showDebug && timelineSummary.behavior_signal > 0 ? (
                <span className="relationship-timeline-stat relationship-timeline-stat--signal">
                  信号 {timelineSummary.behavior_signal}
                </span>
              ) : null}
            </div>
          </section>

          <ul className="relationship-timeline-list">
            {visibleItems.map((item) => {
              const typeStyle = getTypeStyle(item.type);
              const detail = timelineDetailForDisplay(item, showDebug);
              return (
                <li
                  key={item.id}
                  className="relationship-timeline-item"
                  style={{ "--timeline-dot": typeStyle.dot }}
                >
                  <div className="relationship-timeline-item__meta">
                    {formatTime(item.occurredAt)}
                    {" · "}
                    <span
                      className="relationship-timeline-item__badge"
                      style={{
                        background: typeStyle.badgeBg,
                        color: typeStyle.badgeColor,
                      }}
                    >
                      {typeLabelWithActorRole(item, userId)}
                    </span>
                  </div>
                  <div className="relationship-timeline-item__title">
                    {timelineTitleForDisplay(item, showDebug)}
                  </div>
                  {detail ? (
                    <div className="relationship-timeline-item__detail">{detail}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {showLoadMore ? (
            <div className="relationship-timeline-load-more">
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-4"
                onClick={onLoadMoreMessages}
                disabled={loadingMore}
              >
                {loadingMore ? "加载中…" : "继续查看更早消息"}
              </button>
              <span className="relationship-timeline-foot" style={{ marginTop: 0 }}>
                按时间顺序补充历史消息
              </span>
            </div>
          ) : null}
          {loadingMore ? (
            <p className="relationship-timeline-foot" role="status">
              正在加载更早消息…
            </p>
          ) : null}
          {!showLoadMore && !loadingMore && messagePagination?.hasMore === false ? (
            <p className="relationship-timeline-foot" role="status">
              更早的消息已全部加载。
            </p>
          ) : null}

          {showDebug ? (
            <div className="relationship-timeline-debug" aria-label="时间线调试信息">
              {!expectedTimelinePeerUserId ? (
                <p style={{ margin: 0 }}>无最终匹配 handoff（未带 finalMatchPeerUserId）。</p>
              ) : null}
              {expectedTimelinePeerUserId &&
              actualTimelinePeerUserId &&
              timelineHandoffMatched ? (
                <p style={{ margin: 0 }}>最终匹配 handoff 已对齐。</p>
              ) : null}
              {expectedTimelinePeerUserId && peerLookup.status === "loading" ? (
                <p style={{ margin: 0 }}>正在加载会话以比对 handoff…</p>
              ) : null}
              {expectedTimelinePeerUserId && peerLookup.status === "failed" ? (
                <p style={{ margin: 0 }}>无法加载会话，无法比对 finalMatch handoff。</p>
              ) : null}
              {expectedTimelinePeerUserId &&
              peerLookup.status === "ready" &&
              actualTimelinePeerUserId === null ? (
                <p style={{ margin: 0 }}>会话已加载但 candidate 为空，无法比对 handoff。</p>
              ) : null}
              {timelineHandoffMismatch ? (
                <p style={{ margin: 0 }}>
                  handoff expected（脱敏）{maskPeerIdForDebug(expectedTimelinePeerUserId)} · 会话 actual（脱敏）
                  {maskPeerIdForDebug(actualTimelinePeerUserId)}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
