import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { generatePreviewPool, getLatestPreviewPool } from "../api/previewPool";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";

function sortedItems(items) {
  return [...items].sort((a, b) => a.rankInPool - b.rankInPool);
}

function isStringArray(x) {
  return Array.isArray(x) && x.every((i) => typeof i === "string");
}

function isValidItemMeta(m) {
  if (m == null || typeof m !== "object" || Array.isArray(m)) return false;
  if (typeof m.slotReason !== "string") return false;
  if (m.shortHint !== undefined && typeof m.shortHint !== "string") {
    return false;
  }
  if (m.tags !== undefined && !isStringArray(m.tags)) return false;
  return true;
}

export default function PreviewPoolPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [generateHint, setGenerateHint] = useState(null);

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

  const onGenerate = useCallback(async () => {
    if (!userId) return;
    setGenerating(true);
    setGenerateHint(null);
    setError(null);
    try {
      const res = await generatePreviewPool(userId);
      setData(res);
      setGenerateHint("已生成新的预览池");
      window.setTimeout(() => setGenerateHint(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setData(null);
    } finally {
      setGenerating(false);
    }
  }, [userId]);

  const items = data?.items ? sortedItems(data.items) : [];

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>预览池（6 人）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ color: "#666", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        若从未生成过，请先点下方「生成预览池」。规则是：除当前登录用户外，库中至少要有{" "}
        <strong>6 个用户各自在「用户图片」表里有一条及以上记录</strong>（仅注册用户不够，需通过图片接口上传）。
        报错里的 <code>others_with_images</code> 即符合条件的人数。
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
                  {isValidItemMeta(it.itemMeta) && (
                    <div
                      style={{
                        marginBottom: "0.45rem",
                        padding: "0.45rem 0.55rem",
                        background: "#f5f7fa",
                        borderRadius: 6,
                        fontSize: "0.82rem",
                        lineHeight: 1.45,
                        color: "#333",
                      }}
                    >
                      <div>{it.itemMeta.slotReason}</div>
                      {it.itemMeta.shortHint ? (
                        <div style={{ marginTop: "0.25rem", color: "#555" }}>
                          {it.itemMeta.shortHint}
                        </div>
                      ) : null}
                      {it.itemMeta.tags && it.itemMeta.tags.length > 0 ? (
                        <div style={{ marginTop: "0.35rem", color: "#666" }}>
                          tags: {it.itemMeta.tags.join(" · ")}
                        </div>
                      ) : null}
                    </div>
                  )}
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

      <div
        style={{
          marginTop: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading || generating || !userId}
        >
          {generating ? "生成中…" : "生成预览池"}
        </button>
        <button type="button" onClick={load} disabled={loading || generating || !userId}>
          刷新
        </button>
        {generateHint ? (
          <span style={{ color: "#0d6832", fontSize: "0.88rem" }} role="status">
            {generateHint}
          </span>
        ) : null}
      </div>
    </main>
  );
}
