import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getMatchingStatus } from "../api/matching";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";

export default function MatchingWaitingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [statusPayload, setStatusPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId"));
      setStatusPayload(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMatchingStatus(userId);
      setStatusPayload(data);
      if (data.status === "ready") {
        navigate(`/final-match?userId=${encodeURIComponent(userId)}`, {
          replace: true,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatusPayload(null);
    } finally {
      setLoading(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const messageForStatus = (s) => {
    switch (s) {
      case "waiting":
        return "正在等待本轮匹配";
      case "processing":
        return "系统正在处理中";
      case "ready":
        return "匹配已完成，正在跳转…";
      case "not_queued":
        return "你还没有进入匹配队列";
      default:
        return `未知状态：${s}`;
    }
  };

  return (
    <main style={{ maxWidth: 520, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>匹配状态</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        current userId:{" "}
        <code>{userId || "（未设置）"}</code>
      </p>

      {loading && <LoadingState />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && statusPayload && (
        <p style={{ fontSize: "1.05rem", marginTop: "1rem" }}>
          {messageForStatus(statusPayload.status)}
        </p>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          刷新状态
        </button>
      </div>
    </main>
  );
}
