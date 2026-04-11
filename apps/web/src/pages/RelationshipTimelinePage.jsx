import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import ConversationContextBar from "../components/common/ConversationContextBar";
import { getConversationTimeline } from "../api/chat";
import { resolveUserId } from "../utils/resolveUserId";

const TIMELINE_MESSAGE_LIMIT = 20;

const TYPE_LABELS = {
  conversation_opened: "会话开始",
  message_sent: "消息往来",
  summary_snapshot: "摘要快照",
  behavior_signal: "行为信号",
  feedback_on_conversation: "会话反馈",
};

const TYPE_STYLES = {
  conversation_opened: { badgeBg: "#e0f2fe", badgeColor: "#075985", dot: "#0ea5e9" },
  message_sent: { badgeBg: "#eef2ff", badgeColor: "#3730a3", dot: "#6366f1" },
  summary_snapshot: { badgeBg: "#fef3c7", badgeColor: "#92400e", dot: "#f59e0b" },
  behavior_signal: { badgeBg: "#dcfce7", badgeColor: "#166534", dot: "#22c55e" },
  feedback_on_conversation: { badgeBg: "#fce7f3", badgeColor: "#9d174d", dot: "#ec4899" },
};

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

  const freshnessHint =
    "聊天页有新消息、摘要或反馈变化后，建议回到当前页手动刷新查看最新关系进展。";

  useEffect(() => {
    if (!conversationId) {
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

  const items = mergedItems;
  const timelineSummary = useMemo(() => buildTimelineSummary(items), [items]);
  const relationshipStage = useMemo(
    () => inferRelationshipStage(items),
    [items],
  );

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>关系时间线</h1>
      <p style={{ color: "#666", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        关系进展回顾（只读）
      </p>
      <ConversationContextBar
        pageKey="timeline"
        conversationId={conversationId}
        userId={userId}
        chatHref={chatBackHref}
        copilotHref={copilotHref}
        timelineHref={timelineSelfHref}
        freshnessHint={freshnessHint}
        lastRefreshedAt={lastRefreshedAt}
        refreshSource={refreshSource}
      />

      {!conversationId ? (
        <p style={{ color: "#666" }} role="status">
          缺少 conversationId。请从 <Link to="/chat">聊天页</Link> 进入会话后再查看时间线，或使用 <code>?conversationId=…</code>
          （建议同时带上 <code>userId=…</code> 以保持回跳状态一致）。
        </p>
      ) : null}

      {conversationId && loading ? (
        <LoadingState label="加载时间线…" />
      ) : null}

      {conversationId && error ? (
        <p style={{ color: "#b00020" }} role="alert">
          时间线加载失败：{error.message}
        </p>
      ) : null}

      {conversationId && !loading && !error && items.length === 0 ? (
        <p style={{ color: "#666" }} role="status">
          当前暂无可展示的时间线事件。先回到聊天页发送消息，再回来查看关系进展。
        </p>
      ) : null}

      {conversationId && !loading && !error && items.length > 0 ? (
        <>
          <section
            style={{
              marginBottom: "0.85rem",
              padding: "0.7rem 0.8rem",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#fcfcfc",
            }}
            aria-label="关系进展概览"
          >
            <div style={{ fontWeight: 600, marginBottom: "0.35rem", color: "#111827" }}>
              关系进展概览
            </div>
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.85rem", color: "#4b5563" }}>
              当前阶段：{relationshipStage}
            </p>
            <p style={{ margin: "0 0 0.55rem", fontSize: "0.8rem", color: "#6b7280" }}>
              时间线基于当前已写入事件生成。
            </p>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.8rem", color: "#374151", background: "#eef2ff", borderRadius: 999, padding: "0.08rem 0.45rem" }}>
                消息 {timelineSummary.message_sent}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#374151", background: "#fef3c7", borderRadius: 999, padding: "0.08rem 0.45rem" }}>
                摘要 {timelineSummary.summary_snapshot}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#374151", background: "#fce7f3", borderRadius: 999, padding: "0.08rem 0.45rem" }}>
                反馈 {timelineSummary.feedback_on_conversation}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#374151", background: "#dcfce7", borderRadius: 999, padding: "0.08rem 0.45rem" }}>
                信号 {timelineSummary.behavior_signal}
              </span>
            </div>
          </section>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            {items.map((item, idx) => {
              const typeStyle = getTypeStyle(item.type);
              const isLast = idx === items.length - 1;
              return (
              <li
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.65rem 0.75rem",
                  background: "#fff",
                  fontSize: "0.88rem",
                  lineHeight: 1.45,
                  position: "relative",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -14,
                    top: 16,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: typeStyle.dot,
                  }}
                />
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: -10.5,
                      top: 24,
                      width: 1,
                      height: "calc(100% + 10px)",
                      background: "#e5e7eb",
                    }}
                  />
                ) : null}
                <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: 4 }}>
                  {formatTime(item.occurredAt)}
                  {" · "}
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.08rem 0.35rem",
                      borderRadius: 4,
                      background: typeStyle.badgeBg,
                      color: typeStyle.badgeColor,
                      fontWeight: 600,
                      fontSize: "0.72rem",
                    }}
                  >
                    {typeLabelWithActorRole(item, userId)}
                  </span>
                </div>
                <div style={{ fontWeight: 600, color: "#111827" }}>{item.title}</div>
                {item.detail ? (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      color: "#374151",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {item.detail}
                  </div>
                ) : null}
              </li>
            );
            })}
          </ul>
          {showLoadMore ? (
            <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <button type="button" onClick={onLoadMoreMessages} disabled={loadingMore}>
                {loadingMore ? "加载中…" : "继续查看更早消息"}
              </button>
              <span style={{ color: "#6b7280", fontSize: "0.82rem" }}>
                按时间顺序补充历史消息节点
              </span>
            </div>
          ) : null}
          {loadingMore ? (
            <p style={{ color: "#666", fontSize: "0.88rem", marginTop: "0.75rem" }} role="status">
              正在加载更早消息…
            </p>
          ) : null}
          {!showLoadMore && !loadingMore && messagePagination?.hasMore === false ? (
            <p style={{ color: "#6b7280", fontSize: "0.82rem", marginTop: "0.75rem" }} role="status">
              已展示全部可加载消息节点。
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
