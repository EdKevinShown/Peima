import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getMatchingResult } from "../api/matching";
import { getMatchExplanationAi } from "../api/match-explanation-ai";
import { getInteractionSimulationLite } from "../api/interaction-simulation-lite";
import { getMatchReadoutFusion } from "../api/match-readout-fusion";
import { postMatchReviewAi } from "../api/match-review-ai";
import { getAdminAiSimulationV1Job } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";
import AiSimulationSidecarV0 from "../components/review/AiSimulationSidecarV0";
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

function formatDateShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** 主视图分数：0–1 内为匹配指数百分制；否则按 0–100 展示整数或一位小数。 */
function formatScoreDisplay(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const x = Number(v);
  if (x >= 0 && x <= 1) {
    const pct = x * 100;
    const r = Math.round(pct * 10) / 10;
    return Number.isInteger(r) ? String(Math.round(r)) : r.toFixed(1);
  }
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(Math.round(x)) : r.toFixed(1);
}

function isStringArray(x) {
  return Array.isArray(x) && x.every((i) => typeof i === "string");
}

function isValidMatchInsights(mi) {
  if (mi == null || typeof mi !== "object" || Array.isArray(mi)) return false;
  const e = mi.explanation;
  if (e == null || typeof e !== "object" || Array.isArray(e)) return false;
  if (typeof e.whyMatch !== "string") return false;
  if (typeof e.rhythmPrediction !== "string") return false;
  if (!isStringArray(e.strengths)) return false;
  if (!isStringArray(e.cautions)) return false;
  if (!isStringArray(mi.riskFlags)) return false;
  if (!isStringArray(mi.openingTopics)) return false;
  if (typeof mi.chatSimulationSummary !== "string") return false;
  return true;
}

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "1rem 1.1rem",
  background: "#fff",
};

const cardTitle = {
  fontWeight: 600,
  fontSize: "0.98rem",
  margin: "0 0 0.55rem",
  color: "#0f172a",
};

const MATCH_REVIEW_RECOMMENDATION_ZH = {
  strong_match: "高度契合",
  match: "总体匹配",
  cautious_match: "谨慎尝试",
  not_recommended: "暂不推荐",
};

const MATCH_REVIEW_POTENTIAL_ZH = {
  high: "偏高",
  medium: "中等",
  low: "偏低",
};

function matchReviewRecommendationLabel(v) {
  if (v == null || typeof v !== "string") return "—";
  return MATCH_REVIEW_RECOMMENDATION_ZH[v] ?? v;
}

function matchReviewPotentialSentence(label, v) {
  if (v == null || typeof v !== "string") return `${label}：—`;
  const zh = MATCH_REVIEW_POTENTIAL_ZH[v] ?? v;
  return `${label}：${zh}`;
}

function matchReviewConfidenceSentence(v) {
  if (v === "high") return "结论可信度：较高";
  if (v === "medium") return "结论可信度：中等";
  return "结论可信度：有限（问卷或信号较少时请更多依赖线下感受）";
}

const layerSection = {
  marginTop: "1.75rem",
};

const heroStyle = {
  borderRadius: 12,
  padding: "1.35rem 1.25rem 1.25rem",
  background: "linear-gradient(165deg, #f0f7ff 0%, #ffffff 55%, #fafbff 100%)",
  border: "1px solid #dbeafe",
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
};

const aiLayerShell = {
  marginTop: "1.75rem",
  padding: "1.25rem 1.15rem 1.35rem",
  borderRadius: 12,
  border: "1px solid #c7d2fe",
  background: "linear-gradient(180deg, #eef2ff 0%, #ffffff 28%)",
  boxShadow: "0 2px 8px rgba(67,56,202,0.08)",
};

const matchReviewMainPanelStyle = {
  marginTop: "0.85rem",
  padding: "0.9rem 1rem 1rem",
  background: "#f8fafc",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
};

const matchReviewExplanationStyle = {
  margin: 0,
  lineHeight: 1.75,
  whiteSpace: "pre-wrap",
  maxHeight: "15rem",
  overflowY: "auto",
  padding: "0.85rem 1rem",
  background: "#fff",
  borderRadius: 8,
  border: "1px solid #e8eef4",
  fontSize: "0.92rem",
  color: "#1e293b",
};

const btnPrimary = {
  padding: "0.65rem 1.25rem",
  fontSize: "0.95rem",
  fontWeight: 600,
  border: "none",
  borderRadius: 8,
  background: "#1e293b",
  color: "#fff",
  cursor: "pointer",
};

const btnSecondary = {
  padding: "0.6rem 1.1rem",
  fontSize: "0.92rem",
  fontWeight: 500,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#334155",
  cursor: "pointer",
};

const btnTertiary = {
  padding: "0.45rem 0.65rem",
  fontSize: "0.82rem",
  fontWeight: 400,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "#64748b",
  textDecoration: "underline",
  cursor: "pointer",
};

/** P6.y 初次聊天预判：三档展示（接话顺畅度 / 继续了解信号，high 为更有利） */
function formatLiteBand3Zh(band) {
  if (band === "high") return "高";
  if (band === "medium") return "中";
  return "偏低";
}

/** 风险轴：high 表示风险更高 */
function formatLiteRiskBandZh(band) {
  if (band === "low") return "低";
  if (band === "medium") return "中";
  return "高";
}

function formatLiteVerdictZh(verdict) {
  if (verdict === "worth_exploring") return "值得继续了解";
  if (verdict === "cautious") return "谨慎推进";
  return "建议先放缓";
}

/** Internal: full URL for Final Match + AI simulation sidecar query params. */
function buildFinalMatchDeeplink(viewerUserId, simulationJobId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const u = encodeURIComponent(String(viewerUserId).trim());
  const j = encodeURIComponent(String(simulationJobId).trim());
  return `${origin}/final-match?userId=${u}&aiSimJobId=${j}`;
}

export default function FinalMatchPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const aiSimJobId = useMemo(() => (searchParams.get("aiSimJobId") || "").trim(), [searchParams]);

  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiExplanationError, setAiExplanationError] = useState(null);
  const [matchReview, setMatchReview] = useState(null);
  const [matchReviewLoading, setMatchReviewLoading] = useState(false);
  const [matchReviewError, setMatchReviewError] = useState(null);
  const [interactionSim, setInteractionSim] = useState(null);
  const [interactionSimLoading, setInteractionSimLoading] = useState(false);
  const [interactionSimError, setInteractionSimError] = useState(null);
  const [readoutFusion, setReadoutFusion] = useState(null);
  const [aiSimJob, setAiSimJob] = useState(null);
  const [aiSimJobLoading, setAiSimJobLoading] = useState(false);
  const [aiSimJobError, setAiSimJobError] = useState(null);
  /** Hand-filled simulationJobId for internal deeplink helper (may match URL aiSimJobId). */
  const [deeplinkJobIdInput, setDeeplinkJobIdInput] = useState("");
  const [generatedDeeplink, setGeneratedDeeplink] = useState("");
  const [deeplinkCopyStatus, setDeeplinkCopyStatus] = useState("");
  const sidecarStatus = useMemo(() => {
    const candidateUserId = result?.candidateUserId || "";
    const hasJobId = aiSimJobId.length > 0;
    const hasReadableJob = Boolean(aiSimJob && !aiSimJobError);
    const candidateInJob = Boolean(
      hasReadableJob &&
        candidateUserId &&
        Array.isArray(aiSimJob.results) &&
        aiSimJob.results.some((r) => r.candidateUserId === candidateUserId),
    );
    const sidecarReady = hasJobId && hasReadableJob && candidateInJob;
    return {
      candidateUserId,
      hasJobId,
      hasReadableJob,
      candidateInJob,
      sidecarReady,
      jobStatus: aiSimJob?.jobStatus || "—",
    };
  }, [aiSimJobId, aiSimJob, aiSimJobError, result?.candidateUserId]);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId"));
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setAiExplanation(null);
    setAiExplanationError(null);
    setMatchReview(null);
    setMatchReviewError(null);
    setInteractionSim(null);
    setInteractionSimError(null);
    setReadoutFusion(null);
    setAiSimJob(null);
    setAiSimJobError(null);
    try {
      const data = await getMatchingResult(userId);
      setResult(data);
      if (data?.id) {
        try {
          const fusion = await getMatchReadoutFusion(data.id);
          setReadoutFusion(fusion);
        } catch {
          setReadoutFusion(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadAiSimJob = useCallback(async () => {
    if (!aiSimJobId) {
      setAiSimJob(null);
      setAiSimJobError(null);
      setAiSimJobLoading(false);
      return;
    }
    setAiSimJobLoading(true);
    setAiSimJobError(null);
    try {
      const data = await getAdminAiSimulationV1Job(aiSimJobId);
      setAiSimJob(data);
    } catch (e) {
      setAiSimJob(null);
      setAiSimJobError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiSimJobLoading(false);
    }
  }, [aiSimJobId]);

  useEffect(() => {
    if (!aiSimJobId || !result?.candidateUserId) {
      if (!aiSimJobId) {
        setAiSimJob(null);
        setAiSimJobError(null);
        setAiSimJobLoading(false);
      }
      return;
    }
    loadAiSimJob();
  }, [aiSimJobId, result?.candidateUserId, loadAiSimJob]);

  const onFetchMatchReview = useCallback(async () => {
    if (!result?.candidateUserId) return;
    setMatchReviewError(null);
    setMatchReviewLoading(true);
    try {
      const data = await postMatchReviewAi(result.candidateUserId);
      setMatchReview(data);
    } catch (e) {
      setMatchReview(null);
      setMatchReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setMatchReviewLoading(false);
    }
  }, [result?.candidateUserId]);

  const onFetchInteractionSim = useCallback(async () => {
    if (!result?.id) return;
    setInteractionSimError(null);
    setInteractionSimLoading(true);
    try {
      const data = await getInteractionSimulationLite(result.id);
      setInteractionSim(data);
    } catch (e) {
      setInteractionSim(null);
      setInteractionSimError(e instanceof Error ? e.message : String(e));
    } finally {
      setInteractionSimLoading(false);
    }
  }, [result?.id]);

  const onFetchAiExplanation = useCallback(async () => {
    if (!result?.id) return;
    setAiExplanationError(null);
    setAiExplanationLoading(true);
    try {
      const data = await getMatchExplanationAi(result.id);
      setAiExplanation(data);
    } catch (e) {
      setAiExplanation(null);
      setAiExplanationError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiExplanationLoading(false);
    }
  }, [result?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (aiSimJobId) {
      setDeeplinkJobIdInput(aiSimJobId);
    }
  }, [aiSimJobId]);

  const onGenerateDeeplink = useCallback(() => {
    setDeeplinkCopyStatus("");
    if (!userId?.trim() || !deeplinkJobIdInput.trim()) {
      setGeneratedDeeplink("");
      return;
    }
    setGeneratedDeeplink(buildFinalMatchDeeplink(userId, deeplinkJobIdInput));
  }, [userId, deeplinkJobIdInput]);

  const onCopyDeeplink = useCallback(async () => {
    const url =
      generatedDeeplink ||
      (userId?.trim() && deeplinkJobIdInput.trim() ? buildFinalMatchDeeplink(userId, deeplinkJobIdInput) : "");
    if (!url) {
      setDeeplinkCopyStatus("fail");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setDeeplinkCopyStatus("ok");
      setTimeout(() => setDeeplinkCopyStatus(""), 2000);
    } catch {
      setDeeplinkCopyStatus("fail");
    }
  }, [generatedDeeplink, userId, deeplinkJobIdInput]);

  const onOpenDeeplink = useCallback(() => {
    const url =
      generatedDeeplink ||
      (userId?.trim() && deeplinkJobIdInput.trim() ? buildFinalMatchDeeplink(userId, deeplinkJobIdInput) : "");
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [generatedDeeplink, userId, deeplinkJobIdInput]);

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

  const onViewTimeline = useCallback(async () => {
    if (!userId) return;
    try {
      localStorage.setItem("peimaUserId", userId);
      const conv = await createConversation(userId);
      navigate(
        `/chat/timeline?conversationId=${encodeURIComponent(conv.id)}&userId=${encodeURIComponent(userId)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, navigate]);

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem 2.5rem" }}>
      {userId ? (
        <details
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            fontSize: "0.8rem",
            color: "#475569",
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155", userSelect: "none" }}>
            内部工具：生成 Final Match 深链（含 aiSimJobId）
          </summary>
          <p style={{ margin: "0.5rem 0 0.35rem", lineHeight: 1.5 }}>
            当前页 <code style={{ fontSize: "0.76rem" }}>userId</code>（viewer）：
            <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{userId}</code>
          </p>
          <label htmlFor="deeplink-sim-job-id" style={{ display: "block", marginTop: "0.45rem", fontWeight: 500 }}>
            simulationJobId（手填）
          </label>
          <input
            id="deeplink-sim-job-id"
            type="text"
            value={deeplinkJobIdInput}
            onChange={(e) => {
              setDeeplinkJobIdInput(e.target.value);
              setDeeplinkCopyStatus("");
              setGeneratedDeeplink("");
            }}
            placeholder="enqueue 返回的 simulationJobId"
            autoComplete="off"
            style={{
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.55rem",
              fontSize: "0.82rem",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.55rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={onGenerateDeeplink}
              disabled={!userId.trim() || !deeplinkJobIdInput.trim()}
              style={{
                ...btnSecondary,
                padding: "0.45rem 0.75rem",
                fontSize: "0.82rem",
                opacity: !userId.trim() || !deeplinkJobIdInput.trim() ? 0.55 : 1,
              }}
            >
              生成链接
            </button>
            <button
              type="button"
              onClick={onCopyDeeplink}
              disabled={!userId.trim() || !deeplinkJobIdInput.trim()}
              style={{
                ...btnSecondary,
                padding: "0.45rem 0.75rem",
                fontSize: "0.82rem",
                opacity: !userId.trim() || !deeplinkJobIdInput.trim() ? 0.55 : 1,
              }}
            >
              复制链接
            </button>
            <button
              type="button"
              onClick={onOpenDeeplink}
              disabled={!userId.trim() || !deeplinkJobIdInput.trim()}
              style={{
                ...btnPrimary,
                padding: "0.45rem 0.75rem",
                fontSize: "0.82rem",
                background: "#334155",
                opacity: !userId.trim() || !deeplinkJobIdInput.trim() ? 0.55 : 1,
              }}
            >
              新标签页打开
            </button>
            {deeplinkCopyStatus === "ok" ? (
              <span style={{ fontSize: "0.78rem", color: "#15803d" }}>已复制</span>
            ) : deeplinkCopyStatus === "fail" ? (
              <span style={{ fontSize: "0.78rem", color: "#b91c1c" }}>复制失败，请手动全选</span>
            ) : null}
          </div>
          {generatedDeeplink ? (
            <input
              readOnly
              value={generatedDeeplink}
              aria-label="生成的深链"
              style={{
                width: "100%",
                marginTop: "0.55rem",
                padding: "0.45rem 0.55rem",
                fontSize: "0.72rem",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#fff",
                boxSizing: "border-box",
                color: "#0f172a",
              }}
            />
          ) : null}
          <p style={{ margin: "0.45rem 0 0", fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.45 }}>
            不自动发现 job；仅拼接 URL。打开前请确认该 job 的 results 含当前页的对方 candidateUserId。
          </p>
        </details>
      ) : null}
      <details
        style={{
          marginBottom: "1rem",
          padding: "0.65rem 0.85rem",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
          fontSize: "0.8rem",
          color: "#475569",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155", userSelect: "none" }}>
          AI 模拟侧车状态（内部）
        </summary>
        <div style={{ marginTop: "0.5rem", lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 0.25rem" }}>
            aiSimJobId：
            <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{aiSimJobId || "—"}</code>
          </p>
          <p style={{ margin: "0 0 0.25rem" }}>
            jobStatus：<code style={{ fontSize: "0.74rem" }}>{sidecarStatus.jobStatus}</code>
          </p>
          <p style={{ margin: "0 0 0.25rem" }}>
            candidateInJob：
            <strong style={{ color: sidecarStatus.candidateInJob ? "#166534" : "#92400e", marginLeft: "0.25rem" }}>
              {sidecarStatus.candidateInJob
                ? "当前 Final Match 候选已命中当前模拟 job"
                : "当前 Final Match 候选未命中当前模拟 job"}
            </strong>
          </p>
          <p style={{ margin: "0 0 0.25rem" }}>
            sidecarReady：
            <strong style={{ color: sidecarStatus.sidecarReady ? "#166534" : "#92400e", marginLeft: "0.25rem" }}>
              {sidecarStatus.sidecarReady ? "已就绪（ready）" : "未就绪（not ready）"}
            </strong>
          </p>
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
            仅 sidecar / hint 消费，不参与 <code style={{ fontSize: "0.7rem" }}>finalScore</code> 计算，不替代主结论。
          </p>
        </div>
      </details>
      {loading && <LoadingState label="加载匹配结果…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && result && (
        <article>
          {/* —— 第一层：Hero —— */}
          <header style={heroStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
              <div>
                <h1 style={{ fontSize: "1.45rem", margin: "0 0 0.35rem", color: "#0f172a", fontWeight: 700 }}>
                  本轮为你匹配的对象
                </h1>
                <p style={{ margin: 0, color: "#475569", fontSize: "0.92rem", lineHeight: 1.55 }}>
                  系统已综合你的问卷画像与偏好，从候选池中选择了一位更合适的对象。下方可以了解原因、聊天建议，以及可选的进一步解读。
                </p>
              </div>
              <Link
                to={`/matching-waiting?userId=${encodeURIComponent(userId || "")}`}
                style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                返回等待页
              </Link>
            </div>
            <div style={{ marginTop: "1.15rem", paddingTop: "1rem", borderTop: "1px solid rgba(148,163,184,0.35)" }}>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", color: "#64748b", letterSpacing: "0.02em" }}>
                匹配指数（越高表示本轮综合匹配度越好）
              </p>
              <p style={{ margin: 0, fontSize: "2.35rem", fontWeight: 800, color: "#1d4ed8", lineHeight: 1.1 }}>
                {formatScoreDisplay(result.finalScore)}
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                结果更新于 {formatDateShort(result.createdAt)}
              </p>
            </div>
          </header>

          {readoutFusion ? (
            <section
              style={{
                marginTop: "1.05rem",
                padding: "0.85rem 1rem",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
              aria-label="一眼读数"
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                }}
              >
                一眼读数
              </p>
              <p
                style={{
                  margin: "0.4rem 0 0.55rem",
                  fontWeight: 700,
                  fontSize: "0.98rem",
                  color: "#0f172a",
                  lineHeight: 1.45,
                }}
              >
                {readoutFusion.headlineZh}
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.15rem",
                  color: "#475569",
                  fontSize: "0.86rem",
                  lineHeight: 1.55,
                }}
              >
                {readoutFusion.bulletsZh.map((line, i) => (
                  <li key={`fusion-b-${i}`} style={{ marginBottom: "0.28rem" }}>
                    {line}
                  </li>
                ))}
              </ul>
              {readoutFusion.tensionZh?.trim() ? (
                <p
                  style={{
                    margin: "0.55rem 0 0",
                    fontSize: "0.82rem",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {readoutFusion.tensionZh}
                </p>
              ) : null}
              <details style={{ marginTop: "0.55rem", fontSize: "0.74rem", color: "#94a3b8" }}>
                <summary style={{ cursor: "pointer", userSelect: "none" }}>读数依据（折叠）</summary>
                <p style={{ margin: "0.35rem 0 0", lineHeight: 1.5 }}>
                  系统档 {readoutFusion.debug.inputs.workerStance} · 问卷复审档{" "}
                  {readoutFusion.debug.inputs.p6xStance} · 首轮互动档 {readoutFusion.debug.inputs.p6yStance}
                  {readoutFusion.debug.inputs.workerScorePercent != null
                    ? ` · 系统分(百分制约) ${Math.round(readoutFusion.debug.inputs.workerScorePercent)}`
                    : ""}
                </p>
                <p style={{ margin: "0.25rem 0 0", lineHeight: 1.45 }}>
                  {readoutFusion.debug.fusionVersion} · {readoutFusion.debug.ruleTrace}
                </p>
              </details>
            </section>
          ) : null}

          {/* —— 第二层：为什么匹配 / 如何开始互动 —— */}
          {isValidMatchInsights(result.matchInsights) && (
            <section style={layerSection} aria-label="匹配解读与互动建议">
              <h2 style={{ fontSize: "1.12rem", margin: "0 0 1rem", color: "#0f172a", fontWeight: 700 }}>
                了解这次匹配
              </h2>

              <div style={{ ...card, marginBottom: "0.85rem" }}>
                <h3 style={cardTitle}>为什么是你们</h3>
                <p style={{ margin: "0 0 0.65rem", lineHeight: 1.65, color: "#334155", fontSize: "0.92rem" }}>
                  {result.matchInsights.explanation.whyMatch}
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#64748b" }}>较合拍的方向</p>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.65, color: "#334155", fontSize: "0.9rem" }}>
                  {result.matchInsights.explanation.strengths.map((t, i) => (
                    <li key={`strength-${i}`} style={{ marginBottom: "0.3rem" }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ ...card, marginBottom: "0.85rem" }}>
                <h3 style={cardTitle}>相处节奏与注意</h3>
                <p style={{ margin: "0 0 0.65rem", lineHeight: 1.65, color: "#334155", fontSize: "0.92rem" }}>
                  {result.matchInsights.explanation.rhythmPrediction}
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#64748b" }}>需要留意的点</p>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.65, color: "#334155", fontSize: "0.9rem" }}>
                  {result.matchInsights.explanation.cautions.map((t, i) => (
                    <li key={`caution-${i}`} style={{ marginBottom: "0.3rem" }}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ ...card, marginBottom: "0.85rem" }}>
                <h3 style={cardTitle}>聊天怎么开场</h3>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.82rem", color: "#64748b" }}>可以试试这些话题</p>
                <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.2rem", lineHeight: 1.65, color: "#334155", fontSize: "0.9rem" }}>
                  {result.matchInsights.openingTopics.map((t, i) => (
                    <li key={`topic-${i}`} style={{ marginBottom: "0.3rem" }}>
                      {t}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: 0, lineHeight: 1.65, color: "#334155", fontSize: "0.9rem" }}>
                  {result.matchInsights.chatSimulationSummary}
                </p>
              </div>

              <div style={card}>
                <h3 style={cardTitle}>系统参考标记</h3>
                <p style={{ margin: "0 0 0.5rem", lineHeight: 1.55, color: "#475569", fontSize: "0.88rem" }}>
                  以下为系统内部使用的简要标记，便于排查与对照；不影响你与对方正常沟通。
                </p>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "0.86rem", color: "#2563eb", fontWeight: 500 }}>
                    查看完整标记列表
                  </summary>
                  <ul
                    style={{
                      margin: "0.5rem 0 0",
                      paddingLeft: "1.2rem",
                      lineHeight: 1.55,
                      fontSize: "0.84rem",
                      color: "#475569",
                    }}
                  >
                    {result.matchInsights.riskFlags.map((t, i) => (
                      <li key={`risk-${i}`} style={{ marginBottom: "0.25rem" }}>
                        {t}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </section>
          )}

          {/* —— P6.y：初次聊天互动预判（Lite）—— 位于「了解这次匹配」与「匹配复审」之间 —— */}
          <section style={layerSection} aria-label="初次聊天互动预判">
            <div style={{ ...card, borderColor: "#bae6fd", background: "#f8fafc" }}>
              <h2 style={{ ...cardTitle, color: "#0c4a6e" }}>初次聊天互动预判</h2>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.86rem", color: "#0369a1", lineHeight: 1.55 }}>
                仅针对「第一次聊天」场景，结合双方问卷画像与静态摘要给出结构化参考；非诊断、非承诺，不包含对话逐条模拟。
              </p>
              <button
                type="button"
                style={{ ...btnSecondary, borderColor: "#7dd3fc", color: "#0c4a6e" }}
                onClick={onFetchInteractionSim}
                disabled={interactionSimLoading || !result?.id}
              >
                {interactionSimLoading ? "生成中…" : "生成初次聊天预判"}
              </button>
              {interactionSimError ? (
                <p style={{ color: "#b00020", fontSize: "0.86rem", margin: "0.65rem 0 0" }} role="alert">
                  {interactionSimError}
                </p>
              ) : null}
              {interactionSim ? (
                <div style={{ marginTop: "0.85rem" }}>
                  <p style={{ margin: "0 0 0.45rem", fontSize: "0.78rem", color: "#64748b" }}>
                    静态摘要分（与匹配指数不同）：{formatScoreDisplay(interactionSim.reviewStaticScore)}
                  </p>
                  <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.1rem", color: "#334155", fontSize: "0.88rem", lineHeight: 1.6 }}>
                    <li style={{ marginBottom: "0.35rem" }}>
                      <strong>接话顺畅度</strong>：{formatLiteBand3Zh(interactionSim.axes.pickupEase.band)} —{" "}
                      {interactionSim.axes.pickupEase.oneLiner}
                    </li>
                    <li style={{ marginBottom: "0.35rem" }}>
                      <strong>冷场风险</strong>：{formatLiteRiskBandZh(interactionSim.axes.coldFieldRisk.band)} —{" "}
                      {interactionSim.axes.coldFieldRisk.oneLiner}
                    </li>
                    <li style={{ marginBottom: "0.35rem" }}>
                      <strong>误解风险</strong>：{formatLiteRiskBandZh(interactionSim.axes.misunderstandingRisk.band)} —{" "}
                      {interactionSim.axes.misunderstandingRisk.oneLiner}
                    </li>
                    <li style={{ marginBottom: "0.35rem" }}>
                      <strong>继续了解信号</strong>：{formatLiteBand3Zh(interactionSim.axes.continuationSignal.band)} —{" "}
                      {interactionSim.axes.continuationSignal.oneLiner}
                    </li>
                  </ul>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#64748b" }}>总体倾向</p>
                  <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: "#0f172a", fontSize: "0.95rem" }}>
                    {formatLiteVerdictZh(interactionSim.overall.verdict)}
                  </p>
                  <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "#334155", fontSize: "0.9rem" }}>
                    {interactionSim.overall.summary}
                  </p>
                  <details style={{ marginTop: "0.65rem", fontSize: "0.76rem", color: "#64748b" }}>
                    <summary style={{ cursor: "pointer" }}>技术说明</summary>
                    <p style={{ margin: "0.35rem 0 0" }}>
                      sourceType：{interactionSim.debug.sourceType}；fallbackUsed：
                      {String(interactionSim.debug.fallbackUsed)}
                      {interactionSim.debug.meta?.reason
                        ? `；reason：${interactionSim.debug.meta.reason}`
                        : ""}
                    </p>
                  </details>
                </div>
              ) : null}
            </div>
          </section>

          {/* —— 第三层：AI 复审主区 + 补充说明 —— */}
          <section style={aiLayerShell} aria-label="匹配复审与补充解读">
            <AiSimulationSidecarV0
              key={`${aiSimJobId || "no-job"}-${result.candidateUserId || ""}`}
              aiSimJobId={aiSimJobId}
              candidateUserId={result.candidateUserId}
              job={aiSimJob}
              jobLoading={aiSimJobLoading}
              jobError={aiSimJobError}
              onRefresh={loadAiSimJob}
            />
            <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.35rem", color: "#312e81", fontWeight: 700 }}>
              匹配复审与相处参考
            </h2>
            <p style={{ margin: "0 0 1rem", color: "#4c1d95", fontSize: "0.86rem", lineHeight: 1.55, opacity: 0.92 }}>
              结合双方问卷画像给出复审结论与相处参考，便于你带着问题去聊天或见面；不能替代真实相处与专业咨询。
            </p>

            {/* 主模块：AI 匹配复审 */}
            <div style={{ marginBottom: "1.35rem" }}>
              <h3 style={{ ...cardTitle, fontSize: "1.02rem", marginBottom: "0.5rem" }}>匹配复审</h3>
              <p style={{ margin: "0 0 0.85rem", fontSize: "0.86rem", color: "#4338ca", lineHeight: 1.5 }}>
                基于双方问卷画像与静态摘要生成；与上方「匹配指数」含义不同，用于多角度参考。
              </p>
              <button
                type="button"
                style={{
                  ...btnPrimary,
                  background: "#4338ca",
                  padding: "0.7rem 1.4rem",
                  fontSize: "0.96rem",
                }}
                onClick={onFetchMatchReview}
                disabled={matchReviewLoading || !result.candidateUserId}
              >
                {matchReviewLoading ? "正在生成…" : "获取相处参考"}
              </button>
              {matchReviewError ? (
                <p style={{ color: "#b00020", fontSize: "0.86rem", margin: "0.65rem 0 0" }} role="alert">
                  {matchReviewError}
                </p>
              ) : null}
              {matchReview?.aiReview ? (
                <>
                  <div style={matchReviewMainPanelStyle}>
                    <div style={{ ...card, marginTop: "0.75rem", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ ...cardTitle, fontSize: "0.95rem" }}>复审结论</h4>
                      <p style={{ margin: "0 0 0.35rem", fontSize: "0.8rem", color: "#64748b" }}>复审综合分（0–100）</p>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "1.85rem", fontWeight: 800, color: "#0f172a" }}>
                        {formatScoreDisplay(matchReview.aiReview.finalScore)}
                      </p>
                      <p style={{ margin: "0 0 0.35rem", color: "#334155", fontSize: "0.95rem", lineHeight: 1.55 }}>
                        匹配建议：<strong style={{ color: "#0f172a" }}>{matchReviewRecommendationLabel(matchReview.aiReview.recommendation)}</strong>
                      </p>
                      <p style={{ margin: "0 0 0.25rem", color: "#475569", fontSize: "0.88rem", lineHeight: 1.55 }}>
                        {matchReviewPotentialSentence("轻松聊天空间", matchReview.aiReview.conversationPotential)}
                      </p>
                      <p style={{ margin: "0 0 0.25rem", color: "#475569", fontSize: "0.88rem", lineHeight: 1.55 }}>
                        {matchReviewPotentialSentence("长期相处潜力", matchReview.aiReview.longTermPotential)}
                      </p>
                      <p style={{ margin: "0.45rem 0 0", fontSize: "0.86rem", color: "#64748b", lineHeight: 1.5 }}>
                        {matchReviewConfidenceSentence(matchReview.aiReview.confidence)}
                      </p>
                    </div>
                    <div style={{ ...card, marginTop: "0.65rem", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ ...cardTitle, fontSize: "0.95rem" }}>相处亮点</h4>
                      <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 }}>
                        问卷与画像维度上较一致、或有利于开场互动的点。
                      </p>
                      <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.65, color: "#334155", fontSize: "0.9rem" }}>
                        {matchReview.aiReview.strengths.map((t, i) => (
                          <li key={`mrs-${i}`} style={{ marginBottom: "0.35rem" }}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ ...card, marginTop: "0.65rem", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ ...cardTitle, fontSize: "0.95rem" }}>需要留意</h4>
                      <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 }}>
                        更值得提前沟通或放慢节奏的地方（非评判、非诊断）。
                      </p>
                      <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.65, color: "#334155", fontSize: "0.9rem" }}>
                        {matchReview.aiReview.risks.map((t, i) => (
                          <li key={`mrr-${i}`} style={{ marginBottom: "0.35rem" }}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ ...card, marginTop: "0.65rem", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ ...cardTitle, fontSize: "0.95rem" }}>综合说明</h4>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 }}>
                        将亮点与留意点串成一段可读说明。
                      </p>
                      <div style={matchReviewExplanationStyle}>{matchReview.aiReview.explanation}</div>
                    </div>
                  </div>
                  <details
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.55rem 0.7rem",
                      background: "#f1f5f9",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      fontSize: "0.74rem",
                      color: "#475569",
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155" }}>
                      复审技术详情（可选）
                    </summary>
                    <p style={{ margin: "0.45rem 0 0.2rem" }}>
                      静态摘要分 reviewStaticScore：<strong>{formatScoreDisplay(matchReview.reviewStaticScore)}</strong>
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      系统匹配分（接口 debug.matchResultFinalScore，展示）：<strong>{formatScoreDisplay(matchReview.debug.matchResultFinalScore)}</strong>
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      sourceType：<code>{matchReview.debug.sourceType}</code>
                    </p>
                    <p style={{ margin: "0.2rem 0", wordBreak: "break-all" }}>
                      sourceVersion：<code>{matchReview.debug.sourceVersion}</code>
                    </p>
                    <p style={{ margin: "0.2rem 0" }}>
                      fallbackUsed：<code>{String(matchReview.debug.fallbackUsed)}</code>
                    </p>
                    {matchReview.debug.meta?.reason ? (
                      <p style={{ margin: "0.2rem 0" }}>
                        reason：<code>{matchReview.debug.meta.reason}</code>
                      </p>
                    ) : null}
                  </details>
                </>
              ) : null}
            </div>

            {/* 补充模块：AI 匹配说明 */}
            <div
              style={{
                marginTop: "0.25rem",
                paddingTop: "1.1rem",
                borderTop: "1px solid rgba(99,102,241,0.25)",
              }}
            >
              <h3 style={{ ...cardTitle, fontSize: "1rem", color: "#3730a3" }}>补充解读</h3>
              <p style={{ margin: "0 0 0.65rem", fontSize: "0.84rem", color: "#5b21b6", lineHeight: 1.5 }}>
                可选：基于当前匹配结果再生成一段文字说明，便于从不同角度理解本轮结果。
              </p>
              <button
                type="button"
                style={{ ...btnSecondary, borderColor: "#a5b4fc", color: "#3730a3" }}
                onClick={onFetchAiExplanation}
                disabled={aiExplanationLoading || !result.id}
              >
                {aiExplanationLoading ? "生成中…" : "生成补充解读"}
              </button>
              {aiExplanationError ? (
                <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0.55rem 0 0" }} role="alert">
                  {aiExplanationError}
                </p>
              ) : null}
              {aiExplanation ? (
                <div style={{ ...card, marginTop: "0.75rem", border: "1px solid #e0e7ff" }}>
                  <p style={{ margin: "0 0 0.65rem", lineHeight: 1.65, whiteSpace: "pre-wrap", color: "#334155", fontSize: "0.9rem" }}>
                    {aiExplanation.explanationText}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {/* —— 技术详情（整页一次折叠）：candidateId、reasonSummary 原文、AI 说明版本等 —— */}
          <details
            style={{
              marginTop: "1.25rem",
              padding: "0.65rem 0.85rem",
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: "0.78rem",
              color: "#64748b",
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>
              技术详情与原文摘要
            </summary>
            <p style={{ margin: "0.5rem 0 0.25rem" }}>
              当前账号 userId（URL / 本地）：<code style={{ fontSize: "0.74rem" }}>{userId || "—"}</code>
            </p>
            <p style={{ margin: "0.25rem 0" }}>
              对方用户 ID（candidateUserId）：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{result.candidateUserId}</code>
            </p>
            <p style={{ margin: "0.25rem 0" }}>
              结果时间（createdAt 原文）：<code style={{ fontSize: "0.74rem" }}>{formatDate(result.createdAt)}</code>
            </p>
            <p style={{ margin: "0.45rem 0 0.25rem", fontWeight: 600, color: "#64748b" }}>reasonSummary（系统原文）</p>
            <pre
              style={{
                margin: "0.25rem 0 0",
                padding: "0.5rem 0.6rem",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: "0.72rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#334155",
              }}
            >
              {result.reasonSummary ?? "（无）"}
            </pre>
            {aiExplanation ? (
              <>
                <p style={{ margin: "0.65rem 0 0.25rem", fontWeight: 600, color: "#64748b" }}>补充解读 · 来源</p>
                <p style={{ margin: "0.15rem 0", wordBreak: "break-all" }}>
                  sourceType：<code>{aiExplanation.sourceType}</code>
                </p>
                <p style={{ margin: "0.15rem 0", wordBreak: "break-all" }}>
                  sourceVersion：<code>{aiExplanation.sourceVersion}</code>
                </p>
              </>
            ) : null}
          </details>

          {/* —— 第四层：底部行动区 —— */}
          <footer
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
              <button type="button" style={btnPrimary} onClick={onEnterChat} disabled={!userId}>
                进入聊天
              </button>
              <button type="button" style={btnSecondary} onClick={onViewTimeline} disabled={!userId}>
                查看关系时间线
              </button>
            </div>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#94a3b8" }}>
              时间线为只读回顾，便于查看互动脉络。
            </p>
            <div style={{ marginTop: "0.35rem" }}>
              <button type="button" style={btnTertiary} onClick={load} disabled={loading || !userId}>
                刷新匹配结果
              </button>
            </div>
          </footer>
        </article>
      )}

      {!loading && !error && !result && userId && (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>暂无结果数据。</p>
      )}
    </main>
  );
}
