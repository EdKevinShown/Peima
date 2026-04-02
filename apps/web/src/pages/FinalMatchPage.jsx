import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getMatchingResult } from "../api/matching";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";
import { createConversation } from "../api/chat";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FinalMatchPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId"));
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMatchingResult(userId);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onEnterChat = useCallback(async () => {
    if (!userId) return;
    try {
      localStorage.setItem("peimaUserId", userId);
      const conv = await createConversation(userId);
      navigate(
        `/chat?conversationId=${encodeURIComponent(conv.id)}&userId=${encodeURIComponent(userId)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, navigate]);

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem" }}>你的当前最终匹配结果</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        viewer userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link to={`/matching-waiting?userId=${encodeURIComponent(userId || "")}`}>
          返回等待页
        </Link>
      </p>

      {loading && <LoadingState label="加载匹配结果…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && result && (
        <article
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "1rem 1.25rem",
            background: "#fafafa",
          }}
        >
          <dl style={{ margin: 0, display: "grid", gap: "0.75rem" }}>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>candidateUserId</dt>
              <dd style={{ margin: "0.25rem 0 0", fontFamily: "monospace" }}>
                {result.candidateUserId}
              </dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>finalScore</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{result.finalScore ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>reasonSummary</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{result.reasonSummary ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>createdAt</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{formatDate(result.createdAt)}</dd>
            </div>
          </dl>

          <div style={{ marginTop: "1rem" }}>
            <button type="button" onClick={onEnterChat} disabled={!userId}>
              进入聊天
            </button>
          </div>
        </article>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          重新加载
        </button>
      </div>
    </main>
  );
}
