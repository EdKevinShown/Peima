import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getLatestPreviewPool } from "../api/previewPool";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";

function sortedItems(items) {
  return [...items].sort((a, b) => a.rankInPool - b.rankInPool);
}

export default function PreviewPoolPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setError(
        new Error(
          "缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId",
        ),
      );
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getLatestPreviewPool(userId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items ? sortedItems(data.items) : [];

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>预览池（6 人）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link
          to={`/matching-waiting?userId=${encodeURIComponent(userId || "")}`}
        >
          匹配状态
        </Link>
      </p>

      {loading && <LoadingState label="加载预览池…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && data && (
        <>
          <p style={{ color: "#666", fontSize: "0.85rem" }}>
            pool: <code>{data.previewPool.id}</code> · status:{" "}
            {data.previewPool.status}
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "1rem 0 0",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            {items.map((it) => (
              <li
                key={it.id}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: "0.75rem 1rem",
                  position: "relative",
                  background: "#fff",
                }}
              >
                {it.displayMode === "locked" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 8,
                      background: "rgba(240,240,240,0.92)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      color: "#555",
                      zIndex: 1,
                    }}
                  >
                    未解锁
                  </div>
                )}
                <div
                  style={
                    it.displayMode === "blurred"
                      ? { filter: "blur(5px)", userSelect: "none" }
                      : undefined
                  }
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#666",
                      marginBottom: "0.35rem",
                    }}
                  >
                    rank #{it.rankInPool} · {it.displayMode} ·{" "}
                    {it.candidateType}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>
                    candidateUserId: {it.candidateUserId}
                  </div>
                  <div style={{ marginTop: "0.25rem" }}>
                    baseScore: {it.baseScore ?? "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          刷新
        </button>
      </div>
    </main>
  );
}
