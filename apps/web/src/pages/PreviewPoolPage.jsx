import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { generatePreviewPool, getLatestPreviewPool } from "../api/previewPool";
import { getAdminCapabilities, runAdminPostPoolOrchestrationMvp } from "../api/admin";
import { postAdminAiSimulationV1RunJob } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";
import {
  minimalPayloadFromOrchestrationEnvelope,
  storeFinalMatchConsumptionHintForJob,
} from "../utils/finalMatchConsumptionHintStorage";
import LegacyPhotoPreviewFreezeBanner from "../components/legacy/LegacyPhotoPreviewFreezeBanner.jsx";

/** P7.10-r5a: legacy PreviewPool generate frozen; read/orchestration unchanged. */
const LEGACY_PREVIEW_POOL_GENERATE_FROZEN = true;

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

/** 编排链内是否串联 `POST .../ai-simulation/v1/jobs/:id/run`（须显式开启）。 */
const PREVIEW_POOL_ORCH_CHAIN_RUN_JOB = import.meta.env.VITE_PREVIEW_POOL_ORCH_CHAIN_RUN_JOB === "1";
/** run 请求超时（ms）；默认 30s，可用 `VITE_PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS` 覆盖。 */
const PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS = (() => {
  const n = Number(import.meta.env.VITE_PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
})();

export default function PreviewPoolPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [generateHint, setGenerateHint] = useState(null);
  const [adminCaps, setAdminCaps] = useState(null);
  const [orchBusy, setOrchBusy] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await getAdminCapabilities();
        if (!cancelled) setAdminCaps(c);
      } catch {
        if (!cancelled) setAdminCaps({ batchMatchTrigger: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onGenerate = useCallback(async () => {
    if (LEGACY_PREVIEW_POOL_GENERATE_FROZEN) {
      console.warn(
        "[P7.10-r5a] Legacy PreviewPool path is frozen; do not use for new matching production runs.",
      );
      return;
    }
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

  const onRunOrchestrationMvpInternal = useCallback(async () => {
    if (!userId?.trim() || !data?.previewPool?.id) return;
    setOrchBusy(true);
    setError(null);
    try {
      const envelope = await runAdminPostPoolOrchestrationMvp({
        viewerUserId: userId.trim(),
        poolId: data.previewPool.id,
        runMode: "mvp",
      });
      const rawJobId =
        envelope.finalMatchConsumptionHint?.aiSimulation?.simulationJobId ??
        envelope.deeplink?.query?.aiSimJobId ??
        "";
      const simulationJobId = typeof rawJobId === "string" ? rawJobId.trim() : "";
      if (PREVIEW_POOL_ORCH_CHAIN_RUN_JOB && simulationJobId) {
        try {
          await postAdminAiSimulationV1RunJob(simulationJobId, {
            timeoutMs: PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS,
          });
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          const isAbort = e instanceof Error && e.name === "AbortError";
          console.warn(
            "[PreviewPool orchestration] AI simulation run skipped (will still open Final Match):",
            isAbort ? `timeout after ${PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS}ms` : reason,
          );
        }
      }
      const picked = minimalPayloadFromOrchestrationEnvelope(envelope);
      if (picked) {
        storeFinalMatchConsumptionHintForJob(picked.simulationJobId, picked.payload);
      }
      window.location.assign(envelope.deeplink.finalMatchUrl);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setOrchBusy(false);
    }
  }, [userId, data?.previewPool?.id]);

  const items = data?.items ? sortedItems(data.items) : [];

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <LegacyPhotoPreviewFreezeBanner variant="preview_pool" />
      <h1 style={{ fontSize: "1.25rem" }}>预览池（6 人 · legacy PreviewPool）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ color: "#666", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        若从未生成过，请先点下方「生成预览池」。规则是：除当前登录用户外，库中至少要有{" "}
        <strong>6 个用户各自在「用户图片」表里有一条及以上记录</strong>（仅注册用户不够，需通过图片接口上传）。
        报错里的 <code>others_with_images</code> 即符合条件的人数。
      </p>
      <p style={{ color: "#555", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        <strong>槽位语义（当前生成规则）</strong>：rank <strong>1–2</strong> 为{" "}
        <code>visual</code>（风格标签与首图对齐）；rank <strong>3–4</strong> 为{" "}
        <code>preference</code>（按偏好维度得分排序）；rank <strong>5–6</strong> 为{" "}
        <code>backup</code>。视觉位若因有图候选不足而借位补足，该槽可能显示为{" "}
        <code>blurred</code>。
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
          {adminCaps?.batchMatchTrigger ? (
            <details
              style={{
                marginTop: "0.85rem",
                marginBottom: "0.5rem",
                padding: "0.55rem 0.75rem",
                borderRadius: 8,
                border: "1px dashed #94a3b8",
                background: "#f8fafc",
                fontSize: "0.78rem",
                color: "#475569",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "#64748b", userSelect: "none" }}>
                内部（admin）：编排 MVP (A2) → 写 consumption hint → Final Match
              </summary>
              <p style={{ margin: "0.45rem 0 0.35rem", lineHeight: 1.5 }}>
                非 C 端功能；需账号在 <code>PEIMA_ADMIN_USER_IDS</code>（与 batch-match 能力同源）。成功后在有{" "}
                <code>simulationJobId</code> 时写入 <code>sessionStorage</code>，再跳转 orchestrator 返回的 deeplink。
              </p>
              <p style={{ margin: "0.35rem 0 0.35rem", lineHeight: 1.45, fontSize: "0.74rem", color: "#64748b" }}>
                可选串联 AI 模拟 run：在 web 环境设置 <code>VITE_PREVIEW_POOL_ORCH_CHAIN_RUN_JOB=1</code> 时，若有{" "}
                <code>simulationJobId</code> 会先 <code>POST .../jobs/:id/run</code>（默认超时{" "}
                {PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS / 1000}s，可用 <code>VITE_PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS</code>{" "}
                覆盖）；超时或失败仍会写 hint 并跳转，控制台会打 <code>[PreviewPool orchestration]</code> 警告。
              </p>
              <button
                type="button"
                onClick={onRunOrchestrationMvpInternal}
                disabled={orchBusy || !userId?.trim() || !data.previewPool.id}
                style={{
                  marginTop: "0.35rem",
                  padding: "0.4rem 0.65rem",
                  fontSize: "0.78rem",
                  borderRadius: 6,
                  border: "1px solid #64748b",
                  background: "#fff",
                  color: "#334155",
                  cursor: orchBusy || !userId?.trim() || !data.previewPool.id ? "not-allowed" : "pointer",
                  opacity: orchBusy || !userId?.trim() || !data.previewPool.id ? 0.6 : 1,
                }}
              >
                {orchBusy ? "编排中…" : "运行 run-orchestration-mvp（runMode=mvp）并跳转"}
              </button>
            </details>
          ) : null}
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
          disabled={
            LEGACY_PREVIEW_POOL_GENERATE_FROZEN || loading || generating || !userId
          }
          title={
            LEGACY_PREVIEW_POOL_GENERATE_FROZEN
              ? "P7.10-r5a: legacy PreviewPool generate is frozen"
              : undefined
          }
        >
          {LEGACY_PREVIEW_POOL_GENERATE_FROZEN
            ? "生成预览池（已冻结）"
            : generating
              ? "生成中…"
              : "生成预览池"}
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
