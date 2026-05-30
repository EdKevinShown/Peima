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

  /** M6.6-C4：仅用既有 GET conversation 推导会话对方；不改 Copilot API。 */
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

  const freshnessHint = "聊天页有新消息或摘要更新后，建议在当前页手动刷新查看最新状态。";

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
  const cannotDeriveCopilotPeer = Boolean(
    conversationId &&
      (peerLookup.status === "failed" ||
        (peerLookup.status === "ready" && !actualConversationPeerUserId)),
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>沟通建议（只读）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
        沟通洞察基于当前会话快照生成，不代发消息、不推送提醒。
      </p>

      {conversationId ? (
        <div
          style={{
            marginBottom: "0.65rem",
            padding: "0.55rem 0.75rem",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
          aria-label="沟通建议归因"
        >
          {cannotDeriveCopilotPeer ? (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.55 }}>
              本页建议基于当前 conversationId 对应会话。
            </p>
          ) : handoffPeerMismatch ? (
            <p
              role="status"
              style={{ margin: 0, fontSize: "0.84rem", color: "#a16207", lineHeight: 1.55, maxWidth: 520 }}
            >
              最终匹配入口传入对象与当前会话对象不一致，沟通建议仍基于当前会话。
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.55 }}>
              沟通建议基于当前会话中的聊天对象生成。
            </p>
          )}
          {showDebug && (expectedPeerUserId || actualConversationPeerUserId) ? (
            <p
              style={{
                margin: "0.4rem 0 0",
                fontSize: "0.72rem",
                color: "#94a3b8",
                lineHeight: 1.45,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              调试：copilot 归因 peer（脱敏）{maskPeerIdForDebug(actualConversationPeerUserId)} · handoff expected（脱敏）
              {maskPeerIdForDebug(expectedPeerUserId)}
            </p>
          ) : null}
        </div>
      ) : null}

      <ConversationContextBar
        pageKey="copilot"
        conversationId={conversationId}
        userId={userId}
        chatHref={chatBackHref}
        copilotHref={copilotSelfHref}
        timelineHref={timelineHref}
        activityHref={myActivityHref}
        navVariant="phaseG_subtle"
        freshnessHint={freshnessHint}
        lastRefreshedAt={lastRefreshedAt}
        refreshSource={refreshSource}
      />

      {conversationId ? (
        <div style={{ marginBottom: "0.95rem", fontSize: "0.9rem" }}>
          <button
            type="button"
            onClick={() => {
              setNextRefreshSource("manual");
              setRefreshNonce((n) => n + 1);
            }}
            disabled={loading}
          >
            {loading ? "刷新中…" : "刷新沟通洞察"}
          </button>
        </div>
      ) : null}

      {shouldHoldForConversationBootstrap ? (
        <LoadingState label="正在准备会话…" />
      ) : null}
      {!conversationId && !shouldHoldForConversationBootstrap ? (
        <p style={{ color: "#666" }} role="status">
          {ensureConversationError ? (
            <>
              无法创建会话：{ensureConversationError.message}
              <br />
              请确认已登录且存在匹配结果，或从 <Link to="/chat">聊天页</Link> 携带{" "}
              <code>?conversationId=…</code> 进入。
            </>
          ) : (
            <>
              缺少 conversationId。请从 <Link to="/chat">聊天页</Link> 进入会话后再查看洞察，或在地址栏使用{" "}
              <code>?conversationId=…</code>
              （建议同时带上 <code>userId=…</code> 以保持回跳状态一致）。
            </>
          )}
        </p>
      ) : null}

      {conversationId && loading ? <LoadingState label="加载沟通建议…" /> : null}

      {conversationId && error ? (
        <p style={{ color: "#b00020" }} role="alert">
          沟通洞察加载失败：{error.message}
        </p>
      ) : null}

      {conversationId && !loading && !error && !insights ? (
        <p style={{ color: "#666" }} role="status">
          当前暂无可展示的沟通洞察。可返回聊天补充互动或更新摘要后，再点击「刷新沟通洞察」。
        </p>
      ) : null}

      {conversationId && !loading && !error && insights ? (
        <CopilotInsightCard insights={insights} showBasedOn />
      ) : null}
    </main>
  );
}
