import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { getConversationTimeline } from "../api/chat";
import { resolveUserId } from "../utils/resolveUserId";

const TYPE_LABELS = {
  conversation_opened: "会话开始",
  message_sent: "发送消息",
  summary_snapshot: "摘要快照",
  behavior_signal: "行为信号",
  feedback_on_conversation: "会话反馈",
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

export default function RelationshipTimelinePage() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId")?.trim() || "";
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [mergedItems, setMergedItems] = useState([]);
  const [messagePagination, setMessagePagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const chatBackHref = useMemo(() => {
    const q = new URLSearchParams();
    if (conversationId) q.set("conversationId", conversationId);
    if (userId) q.set("userId", userId);
    const s = q.toString();
    return s ? `/chat?${s}` : "/chat";
  }, [conversationId, userId]);

  useEffect(() => {
    if (!conversationId) {
      setMergedItems([]);
      setMessagePagination(null);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
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
        const res = await getConversationTimeline(conversationId);
        if (!cancelled) {
          setMergedItems(Array.isArray(res.items) ? res.items : []);
          setMessagePagination(
            res.messagePagination ?? {
              skip: 0,
              limit: 200,
              hasMore: false,
            },
          );
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
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messagePagination, loadingMore]);

  const showLoadMore =
    Boolean(conversationId) &&
    messagePagination?.hasMore === true &&
    !loading &&
    !loadingMore;

  const items = mergedItems;

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>关系时间线</h1>
      <p style={{ color: "#666", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        Relationship Timeline（只读）
      </p>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
        {conversationId ? (
          <>
            {" · "}
            conversationId: <code>{conversationId}</code>
          </>
        ) : null}
      </p>

      <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link to={chatBackHref}>返回聊天</Link>
      </div>

      {!conversationId ? (
        <p style={{ color: "#666" }} role="status">
          缺少 conversationId。请从聊天页进入，或使用 <code>?conversationId=…</code>
          （建议同时带 <code>userId=…</code>）。
        </p>
      ) : null}

      {conversationId && loading ? (
        <LoadingState label="加载时间线…" />
      ) : null}

      {conversationId && error ? (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      ) : null}

      {conversationId && !loading && !error && items.length === 0 ? (
        <p style={{ color: "#666" }} role="status">
          暂无可展示的时间线项。
        </p>
      ) : null}

      {conversationId && !loading && !error && items.length > 0 ? (
        <>
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
            {items.map((item) => (
              <li
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.65rem 0.75rem",
                  background: "#fafafa",
                  fontSize: "0.88rem",
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: 4 }}>
                  {formatTime(item.occurredAt)}
                  {" · "}
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.08rem 0.35rem",
                      borderRadius: 4,
                      background: "#e0e7ff",
                      color: "#3730a3",
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
            ))}
          </ul>
          {showLoadMore ? (
            <div style={{ marginTop: "1rem" }}>
              <button type="button" onClick={onLoadMoreMessages}>
                加载更多消息
              </button>
            </div>
          ) : null}
          {loadingMore ? (
            <p style={{ color: "#666", fontSize: "0.88rem", marginTop: "0.75rem" }} role="status">
              加载更多消息…
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
