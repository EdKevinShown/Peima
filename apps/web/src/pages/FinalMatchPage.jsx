import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { enqueueMatching, getMatchingResult } from "../api/matching";
import { generatePreviewPool } from "../api/previewPool";
import { getMatchExplanationAi } from "../api/match-explanation-ai";
import { getInteractionSimulationLite } from "../api/interaction-simulation-lite";
import { getMatchReadoutFusion } from "../api/match-readout-fusion";
import { postMatchReviewAi } from "../api/match-review-ai";
import { getViewerAiSimulationV1Job } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";
import AiSimulationSidecarV0 from "../components/review/AiSimulationSidecarV0";
import { resolveUserId } from "../utils/resolveUserId";
import { readValidatedFinalMatchConsumptionHint } from "../utils/finalMatchConsumptionHintStorage";
import { createConversation } from "../api/chat";
import FinalMatchHero from "../components/final-match/FinalMatchHero";
import FinalMatchExplanationSections from "../components/final-match/FinalMatchExplanationSections";
import { FinalMatchTechnicalDetailsContent } from "../components/final-match/FinalMatchTechnicalDetails";

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

/** M6.0-B：v1 分项（0–1）→ 百分数一位小数；缺失或非有限数显示「暂无」。 */
function formatScoreBreakdownPercent(value) {
  if (value == null || typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return "暂无";
  }
  return `${(value * 100).toFixed(1)}%`;
}

/** M6.0-C：关系画像适配度 shadow（0–1）→ 百分数一位小数；缺失显示「暂无」。 */
function formatRelationshipProfilePercent(score) {
  if (score == null || typeof score !== "number" || Number.isNaN(score) || !Number.isFinite(score)) {
    return "暂无";
  }
  return `${(score * 100).toFixed(1)}%`;
}

function isStringArray(x) {
  return Array.isArray(x) && x.every((i) => typeof i === "string");
}

function parseShortlistDecisionV0(job) {
  if (!job || typeof job !== "object") return { state: "unavailable" };
  const decision = job.shortlistDecisionV0;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return { state: "unavailable" };
  }
  const d = decision;
  const schemaVersion = typeof d.schemaVersion === "string" ? d.schemaVersion : "";
  const chosenCandidateUserId =
    typeof d.chosenCandidateUserId === "string" ? d.chosenCandidateUserId : "";
  const rankedCandidateUserIds = isStringArray(d.rankedCandidateUserIds) ? d.rankedCandidateUserIds : [];
  const shortlistFingerprint = typeof d.shortlistFingerprint === "string" ? d.shortlistFingerprint : "";
  const confidenceTier =
    d.confidenceTier === "high" || d.confidenceTier === "medium" || d.confidenceTier === "low"
      ? d.confidenceTier
      : null;

  if (!schemaVersion || !chosenCandidateUserId || rankedCandidateUserIds.length === 0 || !shortlistFingerprint) {
    return { state: "invalid", reason: "数据异常/不可用" };
  }
  if (chosenCandidateUserId !== rankedCandidateUserIds[0]) {
    return { state: "invalid", reason: "数据异常/不可用（chosen 与 ranked[0] 不一致）" };
  }

  const binding = job.shortlistBinding;
  let bindingFingerprint = "";
  if (binding && typeof binding === "object" && !Array.isArray(binding)) {
    const v = binding.shortlistFingerprint;
    if (typeof v === "string") bindingFingerprint = v;
  }
  const fingerprintConsistent = !bindingFingerprint || shortlistFingerprint === bindingFingerprint;

  return {
    state: "ok",
    schemaVersion,
    chosenCandidateUserId,
    rankedCandidateUserIds,
    shortlistFingerprint,
    confidenceTier,
    bindingFingerprint,
    fingerprintConsistent,
  };
}

function parseShortlistFourDimV0(job, shortlistDecisionSidecar) {
  if (!job || typeof job !== "object") return { state: "unavailable" };
  const fourDim = job.shortlistFourDimV0;
  if (!fourDim || typeof fourDim !== "object" || Array.isArray(fourDim)) {
    return { state: "unavailable" };
  }
  const d = fourDim;
  const schemaVersion = typeof d.schemaVersion === "string" ? d.schemaVersion : "";
  const rankingFormulaVersion =
    typeof d.rankingFormulaVersion === "string" ? d.rankingFormulaVersion : "";
  const shortlistFingerprint =
    typeof d.shortlistFingerprint === "string" ? d.shortlistFingerprint : "";
  const comparison = d.comparison;
  const rankedCandidateUserIds =
    comparison &&
    typeof comparison === "object" &&
    !Array.isArray(comparison) &&
    isStringArray(comparison.rankedCandidateUserIds)
      ? comparison.rankedCandidateUserIds
      : [];

  const candidateDimensionsRaw = Array.isArray(d.candidateDimensions) ? d.candidateDimensions : [];
  const candidateDimensions = candidateDimensionsRaw
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const o = row;
      if (typeof o.candidateUserId !== "string") return null;
      const openingSmoothness = Number(o.openingSmoothness);
      const continuation = Number(o.continuation);
      const conflictRisk = Number(o.conflictRisk);
      const longTermStability = Number(o.longTermStability);
      if (
        Number.isNaN(openingSmoothness) ||
        Number.isNaN(continuation) ||
        Number.isNaN(conflictRisk) ||
        Number.isNaN(longTermStability)
      ) {
        return null;
      }
      return {
        candidateUserId: o.candidateUserId,
        openingSmoothness,
        continuation,
        conflictRisk,
        longTermStability,
      };
    })
    .filter(Boolean);

  if (!schemaVersion || !rankingFormulaVersion || !shortlistFingerprint || rankedCandidateUserIds.length === 0) {
    return { state: "invalid", reason: "数据异常/不可用" };
  }
  if (candidateDimensions.length !== candidateDimensionsRaw.length) {
    return { state: "invalid", reason: "数据异常/不可用" };
  }
  if (candidateDimensions.length !== rankedCandidateUserIds.length) {
    return { state: "invalid", reason: "数据异常/不可用" };
  }
  const uniqueDimIds = new Set(candidateDimensions.map((r) => r.candidateUserId));
  if (uniqueDimIds.size !== candidateDimensions.length) {
    return { state: "invalid", reason: "数据异常/不可用" };
  }

  const decisionRanked =
    shortlistDecisionSidecar?.state === "ok" ? shortlistDecisionSidecar.rankedCandidateUserIds : null;
  const rankingConsistentWithDecision =
    !decisionRanked ||
    (decisionRanked.length === rankedCandidateUserIds.length &&
      decisionRanked.every((id, idx) => id === rankedCandidateUserIds[idx]));

  return {
    state: "ok",
    schemaVersion,
    rankingFormulaVersion,
    shortlistFingerprint,
    rankedCandidateUserIds,
    candidateDimensions,
    readable: true,
    rankingConsistentWithDecision,
  };
}

function parseJobAuditV0(job) {
  if (!job || typeof job !== "object") {
    return { state: "unavailable", reason: "job 不可读" };
  }
  const raw = job.jobAuditV0;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { state: "unavailable", reason: "jobAuditV0 缺失" };
  }
  const a = raw;
  const jobStatus = typeof a.jobStatus === "string" ? a.jobStatus : "";
  const schemaVersion = typeof a.schemaVersion === "string" ? a.schemaVersion : "";
  const shortlistBindingPresent = typeof a.shortlistBindingPresent === "boolean" ? a.shortlistBindingPresent : null;
  const sidecarTrioPresent = typeof a.sidecarTrioPresent === "boolean" ? a.sidecarTrioPresent : null;
  const rankConsistent = a.rankConsistent === true || a.rankConsistent === false ? a.rankConsistent : null;
  const sidecarSuppressedReason =
    typeof a.sidecarSuppressedReason === "string" ? a.sidecarSuppressedReason : "unknown";
  const specClassification = typeof a.specClassification === "string" ? a.specClassification : "";
  const diagnosticBucket = typeof a.diagnosticBucket === "string" ? a.diagnosticBucket : "";
  const buildabilityDetail = typeof a.buildabilityDetail === "string" ? a.buildabilityDetail : "";
  const c = a.itemCounts;
  const itemCounts =
    c &&
    typeof c === "object" &&
    !Array.isArray(c) &&
    Number.isFinite(Number(c.total)) &&
    Number.isFinite(Number(c.queued)) &&
    Number.isFinite(Number(c.running)) &&
    Number.isFinite(Number(c.succeeded)) &&
    Number.isFinite(Number(c.failed))
      ? {
          total: Number(c.total),
          queued: Number(c.queued),
          running: Number(c.running),
          succeeded: Number(c.succeeded),
          failed: Number(c.failed),
        }
      : null;

  if (
    !schemaVersion ||
    !jobStatus ||
    shortlistBindingPresent == null ||
    sidecarTrioPresent == null ||
    itemCounts == null ||
    !specClassification ||
    !diagnosticBucket ||
    !buildabilityDetail
  ) {
    return { state: "invalid", reason: "jobAuditV0 字段异常" };
  }
  return {
    state: "ok",
    schemaVersion,
    jobStatus,
    shortlistBindingPresent,
    sidecarTrioPresent,
    itemCounts,
    rankConsistent,
    sidecarSuppressedReason,
    specClassification,
    diagnosticBucket,
    buildabilityDetail,
  };
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

/** M5.4-M2：首跳 enqueue 失败时，仅在错误形态像「池 / 候选」问题时再尝试 generate + 二次 enqueue。 */
function shouldAttemptPreviewPoolRematchFallback(err) {
  const text = (err instanceof Error ? err.message : String(err)).trim();
  if (!text) return false;
  if (/未登录|token\s*无效|401|没有权限|403|userId\s*mismatch|questionnaire|must complete/i.test(text)) {
    return false;
  }
  return /\bpool\b|preview|active|候选|匹配池|candidate|items?|queue|batch|scored|empty|not found|404|unavailable|NO_ACTIVE/i.test(
    text,
  );
}

const REMATCH_USER_FACING_FAILURE =
  "重新匹配失败，请稍后再试。若问题持续，请先返回预览池重新生成候选。";

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
  /** M4.3-M1: show A/B tables, ids, internal tools only when `?debug=1`. */
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);

  const [consumptionHint, setConsumptionHint] = useState(null);

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
  /** M5.4-M1：重新入队后去等待页，避免旧 ready 立刻跳回 final。 */
  const [rematchLoading, setRematchLoading] = useState(false);
  /** M5.4-M2：generate + 二次 enqueue 阶段。 */
  const [rematchPreparingPool, setRematchPreparingPool] = useState(false);
  const [rematchError, setRematchError] = useState(null);
  /** M3.8-M13: 展示与下游 API（复审 / 侧车）一致用 displayCandidateUserId，无则回退 MatchResult.candidateUserId。 */
  const effectiveDisplayCandidateId = useMemo(
    () => String(result?.displayCandidateUserId || result?.candidateUserId || "").trim(),
    [result?.displayCandidateUserId, result?.candidateUserId],
  );
  /** M5.5-UI-R4: 关系节奏影响展示对象；finalScore 仍仅为基础适配参考，不由关系节奏重算。 */
  const isRrmDisplay = useMemo(
    () => result?.displaySourceType === "rrm_top2_bounded_selector",
    [result?.displaySourceType],
  );
  const sidecarStatus = useMemo(() => {
    const candidateUserId = effectiveDisplayCandidateId;
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
  }, [aiSimJobId, aiSimJob, aiSimJobError, effectiveDisplayCandidateId]);
  const shortlistDecisionSidecar = useMemo(() => parseShortlistDecisionV0(aiSimJob), [aiSimJob]);
  const shortlistFourDimSidecar = useMemo(
    () => parseShortlistFourDimV0(aiSimJob, shortlistDecisionSidecar),
    [aiSimJob, shortlistDecisionSidecar],
  );
  const jobAuditSidecar = useMemo(() => parseJobAuditV0(aiSimJob), [aiSimJob]);

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

  const loadAiSimJob = useCallback(
    async (opts = {}) => {
      const silent = Boolean(opts?.silent);
      if (!aiSimJobId) {
        setAiSimJob(null);
        setAiSimJobError(null);
        setAiSimJobLoading(false);
        return;
      }
      if (!silent) {
        setAiSimJobLoading(true);
        setAiSimJobError(null);
      }
      try {
        const data = await getViewerAiSimulationV1Job(aiSimJobId);
        setAiSimJob(data);
        if (!silent) {
          setAiSimJobError(null);
        }
      } catch (e) {
        if (!silent) {
          setAiSimJob(null);
          setAiSimJobError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!silent) {
          setAiSimJobLoading(false);
        }
      }
    },
    [aiSimJobId],
  );

  useEffect(() => {
    if (!aiSimJobId || !effectiveDisplayCandidateId) {
      if (!aiSimJobId) {
        setAiSimJob(null);
        setAiSimJobError(null);
        setAiSimJobLoading(false);
      }
      return;
    }
    loadAiSimJob();
  }, [aiSimJobId, effectiveDisplayCandidateId, loadAiSimJob]);

  /** M3.2: poll job while server-side LLM generation is in progress (no full-page block). */
  useEffect(() => {
    if (!aiSimJobId || !effectiveDisplayCandidateId) return;
    const st = (aiSimJob?.jobStatus || "").trim();
    if (st !== "queued" && st !== "running") return;

    const id = window.setInterval(() => {
      void loadAiSimJob({ silent: true });
    }, 3500);
    return () => window.clearInterval(id);
  }, [aiSimJobId, effectiveDisplayCandidateId, aiSimJob?.jobStatus, loadAiSimJob]);

  useEffect(() => {
    if (!aiSimJobId) {
      setConsumptionHint(null);
      return;
    }
    setConsumptionHint(readValidatedFinalMatchConsumptionHint(aiSimJobId));
  }, [aiSimJobId]);

  const onFetchMatchReview = useCallback(async () => {
    if (!effectiveDisplayCandidateId) return;
    setMatchReviewError(null);
    setMatchReviewLoading(true);
    try {
      const data = await postMatchReviewAi(effectiveDisplayCandidateId);
      setMatchReview(data);
    } catch (e) {
      console.warn("[FinalMatchPage] match review failed", e);
      setMatchReview(null);
      setMatchReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setMatchReviewLoading(false);
    }
  }, [effectiveDisplayCandidateId]);

  const onFetchInteractionSim = useCallback(async () => {
    if (!result?.id) return;
    setInteractionSimError(null);
    setInteractionSimLoading(true);
    try {
      const data = await getInteractionSimulationLite(result.id);
      setInteractionSim(data);
    } catch (e) {
      console.warn("[FinalMatchPage] interaction simulation lite failed", e);
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

  const onRematchEnqueue = useCallback(async () => {
    if (!userId || !result?.id) return;
    setRematchLoading(true);
    setRematchPreparingPool(false);
    setRematchError(null);

    const goWaiting = () => {
      navigate(
        `/matching-waiting?userId=${encodeURIComponent(userId)}&rematch=1&baselineResultId=${encodeURIComponent(result.id)}`,
        { replace: true },
      );
    };

    try {
      await enqueueMatching(userId);
      goWaiting();
    } catch (firstErr) {
      console.warn("[rematch] first enqueueMatching failed", firstErr);
      if (!shouldAttemptPreviewPoolRematchFallback(firstErr)) {
        setRematchError(REMATCH_USER_FACING_FAILURE);
        return;
      }
      setRematchPreparingPool(true);
      try {
        try {
          await generatePreviewPool(userId);
        } catch (genErr) {
          console.warn("[rematch] generatePreviewPool failed", genErr);
          setRematchError(REMATCH_USER_FACING_FAILURE);
          return;
        }
        try {
          await enqueueMatching(userId);
          goWaiting();
        } catch (secondErr) {
          console.warn("[rematch] second enqueueMatching failed", secondErr);
          setRematchError(REMATCH_USER_FACING_FAILURE);
        }
      } finally {
        setRematchPreparingPool(false);
      }
    } finally {
      setRematchLoading(false);
    }
  }, [userId, result?.id, navigate]);

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
      const conv = result?.id
        ? await createConversation(userId, { matchResultId: result.id })
        : await createConversation(userId);
      const q = new URLSearchParams();
      q.set("conversationId", conv.id);
      q.set("userId", userId);
      if (result?.id) {
        q.set("fromFinalMatch", "1");
        q.set("matchResultId", result.id);
      }
      if (isRrmDisplay) {
        q.set("rhythmRecommended", "1");
      }
      navigate(`/chat?${q.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, navigate, result?.id, isRrmDisplay]);

  const onViewTimeline = useCallback(async () => {
    if (!userId) return;
    try {
      localStorage.setItem("peimaUserId", userId);
      const conv = result?.id
        ? await createConversation(userId, { matchResultId: result.id })
        : await createConversation(userId);
      const q = new URLSearchParams();
      q.set("conversationId", conv.id);
      q.set("userId", userId);
      if (result?.id) {
        q.set("fromFinalMatch", "1");
        q.set("matchResultId", result.id);
      }
      if (isRrmDisplay) {
        q.set("rhythmRecommended", "1");
      }
      navigate(`/chat/timeline?${q.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, navigate, result?.id, isRrmDisplay]);

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "1rem 1rem 2.5rem" }}>
      {userId && isDebugMode ? (
        <>
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
            开发者调试：生成 Final Match 深链（含 aiSimJobId）
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
          开发者调试：AI 模拟侧车状态
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
          {!aiSimJobId || aiSimJobLoading || aiSimJobError ? (
            <p style={{ margin: "0 0 0.25rem" }}>jobAuditV0：暂不可用（依赖 job 查询）</p>
          ) : jobAuditSidecar.state === "unavailable" ? (
            <p style={{ margin: "0 0 0.25rem" }}>
              jobAuditV0：未提供（平滑降级，保留现有 sidecar 展示）
            </p>
          ) : jobAuditSidecar.state === "invalid" ? (
            <p style={{ margin: "0 0 0.25rem", color: "#92400e" }}>
              jobAuditV0：{jobAuditSidecar.reason}
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.25rem" }}>
                jobAuditV0.schemaVersion：
                <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>{jobAuditSidecar.schemaVersion}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                itemCounts：
                <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                  total {jobAuditSidecar.itemCounts.total} / queued {jobAuditSidecar.itemCounts.queued} / running{" "}
                  {jobAuditSidecar.itemCounts.running} / succeeded {jobAuditSidecar.itemCounts.succeeded} / failed{" "}
                  {jobAuditSidecar.itemCounts.failed}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                shortlistBindingPresent：
                <strong
                  style={{
                    color: jobAuditSidecar.shortlistBindingPresent ? "#166534" : "#92400e",
                    marginLeft: "0.25rem",
                  }}
                >
                  {String(jobAuditSidecar.shortlistBindingPresent)}
                </strong>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                sidecarTrioPresent：
                <strong
                  style={{
                    color: jobAuditSidecar.sidecarTrioPresent ? "#166534" : "#92400e",
                    marginLeft: "0.25rem",
                  }}
                >
                  {String(jobAuditSidecar.sidecarTrioPresent)}
                </strong>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                rankConsistent：
                <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                  {jobAuditSidecar.rankConsistent == null ? "null (in progress)" : String(jobAuditSidecar.rankConsistent)}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                sidecarSuppressedReason：
                <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                  {jobAuditSidecar.sidecarSuppressedReason}
                </code>
              </p>
            </>
          )}
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
            仅 sidecar / hint 消费，不参与 <code style={{ fontSize: "0.7rem" }}>finalScore</code> 计算，不替代主结论。
          </p>
          {aiSimJobId ? (
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem" }}>
              <Link to={`/admin/ai-sim-job-diagnostic?jobId=${encodeURIComponent(aiSimJobId)}`}>
                打开 AI 模拟 job 诊断详情（内部只读）
              </Link>
            </p>
          ) : null}
        </div>
      </details>
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
          开发者调试：AI 四维侧车（shortlistFourDimV0）
        </summary>
        <div style={{ marginTop: "0.5rem", lineHeight: 1.55 }}>
          {!aiSimJobId || aiSimJobLoading || aiSimJobError || shortlistFourDimSidecar.state === "unavailable" ? (
            <p style={{ margin: 0 }}>AI 四维侧车暂不可用。</p>
          ) : shortlistFourDimSidecar.state === "invalid" ? (
            <p style={{ margin: 0, color: "#92400e" }}>{shortlistFourDimSidecar.reason}</p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.25rem" }}>
                schemaVersion：<code style={{ fontSize: "0.74rem" }}>{shortlistFourDimSidecar.schemaVersion}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                rankingFormulaVersion：
                <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                  {shortlistFourDimSidecar.rankingFormulaVersion}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                shortlistFingerprint：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all", marginLeft: "0.25rem" }}>
                  {shortlistFourDimSidecar.shortlistFingerprint}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                comparison.rankedCandidateUserIds：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all", marginLeft: "0.25rem" }}>
                  {shortlistFourDimSidecar.rankedCandidateUserIds.join(" > ")}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                四维结果可读（candidateDimensions 人数 == comparison 排序人数）：
                <strong style={{ color: "#166534", marginLeft: "0.25rem" }}>是</strong>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                与 shortlistDecisionV0 排序一致性：
                <strong
                  style={{
                    color: shortlistFourDimSidecar.rankingConsistentWithDecision ? "#166534" : "#92400e",
                    marginLeft: "0.25rem",
                  }}
                >
                  {shortlistFourDimSidecar.rankingConsistentWithDecision
                    ? "一致"
                    : "不一致（低权重警示）"}
                </strong>
              </p>
              <div style={{ marginTop: "0.45rem", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        candidateUserId
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        openingSmoothness
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        continuation
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        conflictRisk
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        longTermStability
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortlistFourDimSidecar.candidateDimensions.map((row) => (
                      <tr key={row.candidateUserId}>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          <code style={{ fontSize: "0.72rem" }}>{row.candidateUserId}</code>
                        </td>
                        <td style={{ textAlign: "right", padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {row.openingSmoothness.toFixed(4)}
                        </td>
                        <td style={{ textAlign: "right", padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {row.continuation.toFixed(4)}
                        </td>
                        <td style={{ textAlign: "right", padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {row.conflictRisk.toFixed(4)}
                        </td>
                        <td style={{ textAlign: "right", padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {row.longTermStability.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
                仅 AI 四维侧车只读展示，不参与主结果计算，不替代系统主结论。
              </p>
            </>
          )}
        </div>
      </details>
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
          开发者调试：AI 决胜侧车（shortlistDecisionV0）
        </summary>
        <div style={{ marginTop: "0.5rem", lineHeight: 1.55 }}>
          {!aiSimJobId || aiSimJobLoading || aiSimJobError || shortlistDecisionSidecar.state === "unavailable" ? (
            <p style={{ margin: 0 }}>AI 决胜侧车暂不可用。</p>
          ) : shortlistDecisionSidecar.state === "invalid" ? (
            <p style={{ margin: 0, color: "#92400e" }}>{shortlistDecisionSidecar.reason}</p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.25rem" }}>
                schemaVersion：<code style={{ fontSize: "0.74rem" }}>{shortlistDecisionSidecar.schemaVersion}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                chosenCandidateUserId：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all", marginLeft: "0.25rem" }}>
                  {shortlistDecisionSidecar.chosenCandidateUserId}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                rankedCandidateUserIds：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all", marginLeft: "0.25rem" }}>
                  {shortlistDecisionSidecar.rankedCandidateUserIds.join(" > ")}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                shortlistFingerprint：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all", marginLeft: "0.25rem" }}>
                  {shortlistDecisionSidecar.shortlistFingerprint}
                </code>
              </p>
              {shortlistDecisionSidecar.confidenceTier ? (
                <p style={{ margin: "0 0 0.25rem" }}>
                  confidenceTier：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                    {shortlistDecisionSidecar.confidenceTier}
                  </code>
                </p>
              ) : null}
              <p style={{ margin: "0 0 0.25rem" }}>
                决胜结果可读（chosen===ranked[0]）：
                <strong style={{ color: "#166534", marginLeft: "0.25rem" }}>是</strong>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                fingerprint 与 binding 一致性：
                <strong
                  style={{
                    color: shortlistDecisionSidecar.fingerprintConsistent ? "#166534" : "#92400e",
                    marginLeft: "0.25rem",
                  }}
                >
                  {shortlistDecisionSidecar.fingerprintConsistent ? "一致" : "不一致（低权重警示）"}
                </strong>
              </p>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
                仅 AI 决胜侧车只读展示，不参与主结果计算，不替代系统主结论。
              </p>
            </>
          )}
        </div>
      </details>
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
          开发者调试：编排 consumption hint（sessionStorage）
        </summary>
        <div style={{ marginTop: "0.5rem", lineHeight: 1.55 }}>
          {!aiSimJobId ? (
            <p style={{ margin: 0 }}>URL 无 aiSimJobId，未读取 sessionStorage。</p>
          ) : !consumptionHint ? (
            <p style={{ margin: 0 }}>
              无有效 hint（未从预览池转交、校验失败或已按 v0 协议降级）。运行态仍以 job 查询与 sidecarReady 为准。
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.25rem" }}>
                poolId：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{consumptionHint.poolId}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                runMode：<code style={{ fontSize: "0.74rem" }}>{consumptionHint.runMode}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                hint.ready（编排侧，非 sidecarReady）：<code style={{ fontSize: "0.74rem" }}>{String(consumptionHint.ready)}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                prescreen：{consumptionHint.prescreen.candidateCount} 人 · promote{" "}
                {consumptionHint.prescreen.bucketCounts.promote} / neutral{" "}
                {consumptionHint.prescreen.bucketCounts.neutral} / demote{" "}
                {consumptionHint.prescreen.bucketCounts.demote}
              </p>
              {consumptionHint.notes?.length ? (
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "#64748b" }}>
                  notes：{consumptionHint.notes.join(" · ")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </details>
        </>
      ) : null}
      {loading && <LoadingState label="加载匹配结果" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && result && (
        <article>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "0.65rem",
              marginBottom: "0.5rem",
            }}
          >
            <button
              type="button"
              onClick={() => void onRematchEnqueue()}
              disabled={rematchLoading || !userId}
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                cursor: rematchLoading || !userId ? "not-allowed" : "pointer",
                opacity: rematchLoading || !userId ? 0.65 : 1,
              }}
            >
              {rematchPreparingPool
                ? "正在重新准备候选池并发起匹配"
                : rematchLoading
                  ? "处理中"
                  : "重新匹配"}
            </button>
            <Link
              to={`/matching-waiting?userId=${encodeURIComponent(userId || "")}`}
              style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}
            >
              返回等待页
            </Link>
          </div>
          {rematchError ? (
            <p style={{ color: "#b00020", fontSize: "0.85rem", marginBottom: "0.75rem" }} role="alert">
              {rematchError}
            </p>
          ) : null}
          <FinalMatchHero
            isRrmDisplay={isRrmDisplay}
            finalScore={result.finalScore}
            createdAt={result.createdAt}
            formatScoreDisplay={formatScoreDisplay}
            formatDateShort={formatDateShort}
          />

          <section
            style={{
              marginTop: "0.9rem",
              padding: "0.9rem 1rem",
              borderRadius: 10,
              border: "1px solid #ccfbf1",
              background: "linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)",
              maxWidth: 520,
            }}
            aria-label="关系画像适配度 shadow"
          >
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.78rem", color: "#0f766e", fontWeight: 600, letterSpacing: "0.02em" }}>
              关系画像适配度
            </p>
            <p style={{ margin: "0 0 0.55rem", fontSize: "1.55rem", fontWeight: 800, color: "#115e59", lineHeight: 1.15 }}>
              {formatRelationshipProfilePercent(result.relationshipProfileScore?.score)}
            </p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#475569", lineHeight: 1.55 }}>
              关系画像适配度主要来自双方 20 维关系画像的相似度。它不同于当前 legacy 匹配指数；当前 legacy
              匹配指数还包含候选池基础分、偏好命中分和风格匹配分。
            </p>
            {isRrmDisplay ? (
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.82rem", color: "#475569", lineHeight: 1.55 }}>
                关系节奏推荐会影响本轮展示对象，但不会改写这里的基础分数。
              </p>
            ) : null}
          </section>

          {!isValidMatchInsights(result.matchInsights) ? (
            <p style={{ marginTop: "1rem", color: "#64748b", fontSize: "0.9rem", lineHeight: 1.55 }}>
              结构化匹配解读暂不可用。你可以在页面底部展开「技术来源说明」，查看系统侧保存的原始字段与读数摘要。
            </p>
          ) : null}

          {isValidMatchInsights(result.matchInsights) ? (
            <div style={{ marginTop: "1.1rem" }}>
              <FinalMatchExplanationSections
                isRrmDisplay={isRrmDisplay}
                insights={result.matchInsights}
                openingTopics={result.matchInsights.openingTopics}
                interactionSim={interactionSim}
                interactionSimLoading={interactionSimLoading}
                interactionSimError={interactionSimError}
                onFetchInteractionSim={onFetchInteractionSim}
                matchReview={matchReview}
                matchReviewLoading={matchReviewLoading}
                matchReviewError={matchReviewError}
                onRequestMatchReview={onFetchMatchReview}
              />
            </div>
          ) : null}

          {/* —— 主流程底部行动区 —— */}
          <footer
            style={{
              marginTop: "1.5rem",
              paddingTop: "1.15rem",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, maxWidth: 440 }}>
              <strong>下一步：</strong>准备好后点击「进入聊天」。如需核对模拟侧车、补充说明或原始技术字段，请展开页面底部的「技术来源说明」。
            </p>
            <button
              type="button"
              style={{ ...btnPrimary, minWidth: "min(100%, 240px)" }}
              onClick={onEnterChat}
              disabled={!userId}
            >
              进入聊天
            </button>
            <button
              type="button"
              onClick={onViewTimeline}
              disabled={!userId}
              style={{
                ...btnTertiary,
                marginTop: 0,
                fontSize: "0.8rem",
                padding: "0.35rem 0",
              }}
            >
              查看关系时间线（可选回顾）
            </button>
            <button type="button" style={btnTertiary} onClick={load} disabled={loading || !userId}>
              刷新匹配结果
            </button>
          </footer>

          <details
            style={{
              marginTop: "1.35rem",
              padding: "0.75rem 0.9rem",
              background: "#f1f5f9",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: "0.8rem",
              color: "#475569",
            }}
            aria-label="匹配分数构成"
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155", userSelect: "none", fontSize: "0.92rem" }}>
              匹配分数构成
            </summary>
            <div style={{ marginTop: "0.65rem", lineHeight: 1.65 }}>
              <p style={{ margin: "0 0 0.35rem" }}>
                <strong>候选池基础分：</strong>
                {formatScoreBreakdownPercent(result.scoreBreakdown?.previewPoolScore)}
              </p>
              <p style={{ margin: "0 0 0.35rem" }}>
                <strong>偏好命中分：</strong>
                {formatScoreBreakdownPercent(result.scoreBreakdown?.preferenceScore)}
              </p>
              <p style={{ margin: "0 0 0.35rem" }}>
                <strong>风格匹配分：</strong>
                {formatScoreBreakdownPercent(result.scoreBreakdown?.styleScore)}
              </p>
              <p style={{ margin: "0 0 0.35rem" }}>
                <strong>问卷画像分：</strong>
                {formatScoreBreakdownPercent(result.scoreBreakdown?.profileScore)}
              </p>
            </div>
            <p style={{ margin: "0.55rem 0 0", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.55 }}>
              当前匹配指数由多项信号综合而来。候选池基础分和偏好命中分较高时，总分可能保持在较高区间；问卷画像分反映双方
              20 维关系画像的相似度。
            </p>
            {isRrmDisplay ? (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.55 }}>
                关系节奏推荐会影响本轮展示对象，但不会改写这里的基础分数。
              </p>
            ) : null}
          </details>

          <details
            style={{
              marginTop: "1.35rem",
              padding: "0.75rem 0.9rem",
              background: "#f8fafc",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: "0.8rem",
              color: "#475569",
            }}
            aria-label="技术来源说明"
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155", userSelect: "none", fontSize: "0.92rem" }}>
              技术来源说明
            </summary>
            <FinalMatchTechnicalDetailsContent
              displaySourceType={result.displaySourceType}
              finalMatchDecisionMeta={result.finalMatchDecisionMeta}
              readoutFusion={readoutFusion}
              candidateUserId={result.candidateUserId}
              displayCandidateUserId={effectiveDisplayCandidateId}
              finalScore={result.finalScore}
              reasonSummary={result.reasonSummary}
              multiSourceFinalDecision={result.multiSourceFinalDecision}
              matchReviewDebug={matchReview?.debug ?? null}
              aiExplanationMeta={
                aiExplanation
                  ? { sourceType: aiExplanation.sourceType, sourceVersion: aiExplanation.sourceVersion }
                  : null
              }
              matchInsights={result.matchInsights ?? null}
              matchReviewFull={matchReview}
              interactionSimFull={interactionSim}
              footerPanels={
                <>
                  <h3 style={{ fontWeight: 600, fontSize: "0.92rem", margin: "0 0 0.5rem", color: "#0f172a" }}>模拟侧车</h3>
                  <p style={{ margin: "0 0 0.55rem", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
                    以下为基于对话模拟的只读参考，与主推荐结论相互独立。
                  </p>
                  {aiSimJobId &&
                  effectiveDisplayCandidateId &&
                  (aiSimJobLoading || aiSimJob != null || aiSimJobError != null) ? (
                    <div style={{ marginBottom: "1rem" }}>
                      <AiSimulationSidecarV0
                        key={`${aiSimJobId || "no-job"}-${effectiveDisplayCandidateId || ""}`}
                        aiSimJobId={aiSimJobId}
                        candidateUserId={effectiveDisplayCandidateId}
                        job={aiSimJob}
                        jobLoading={aiSimJobLoading}
                        jobError={aiSimJobError}
                        onRefresh={loadAiSimJob}
                      />
                    </div>
                  ) : (
                    <p style={{ margin: "0 0 0.85rem", fontSize: "0.78rem", color: "#94a3b8" }}>
                      当前链接未携带可用的模拟任务编号，或任务尚未加载。主推荐不依赖本区域。
                    </p>
                  )}
                  <div style={{ paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0" }}>
                    <h3 style={{ fontWeight: 600, fontSize: "0.92rem", margin: "0 0 0.45rem", color: "#0f172a" }}>补充解读</h3>
                    <p style={{ margin: "0 0 0.55rem", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
                      基于当前匹配结果生成的可选文字说明（仅供技术或复盘查看）。
                    </p>
                    <button
                      type="button"
                      style={btnSecondary}
                      onClick={onFetchAiExplanation}
                      disabled={aiExplanationLoading || !result.id}
                    >
                      {aiExplanationLoading ? "正在生成补充解读" : "生成补充解读"}
                    </button>
                    {aiExplanationError ? (
                      <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0.55rem 0 0" }} role="alert">
                        暂时无法生成补充解读，请稍后再试。
                      </p>
                    ) : null}
                    {aiExplanation ? (
                      <div
                        style={{
                          marginTop: "0.65rem",
                          padding: "0.75rem 0.85rem",
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                        }}
                      >
                        <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#334155", fontSize: "0.82rem" }}>
                          {aiExplanation.explanationText}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </>
              }
            />
          </details>

          {isDebugMode ? (
            <details
              style={{
                marginTop: "1rem",
                padding: "0.65rem 0.85rem",
                background: "#fff7ed",
                borderRadius: 8,
                border: "1px solid #fed7aa",
                fontSize: "0.78rem",
                color: "#64748b",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "#9a3412" }}>
                开发者调试信息（含 ID 与系统原文）
              </summary>
              <p style={{ margin: "0.5rem 0 0.25rem" }}>
                当前账号 userId（URL / 本地）：<code style={{ fontSize: "0.74rem" }}>{userId || "—"}</code>
              </p>
              <p style={{ margin: "0.25rem 0" }}>
                系统匹配对象 ID（MatchResult.candidateUserId）：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{result.candidateUserId}</code>
              </p>
              <p style={{ margin: "0.25rem 0" }}>
                当前展示对象 ID（displayCandidateUserId · {result.displaySourceType || "—"}）：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{effectiveDisplayCandidateId}</code>
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
              {matchReview?.debug ? (
                <>
                  <p style={{ margin: "0.65rem 0 0.25rem", fontWeight: 600, color: "#64748b" }}>复审接口 debug</p>
                  <p style={{ margin: "0.15rem 0" }}>
                    sourceType：<code>{matchReview.debug.sourceType}</code> · fallbackUsed：
                    <code>{String(matchReview.debug.fallbackUsed)}</code>
                  </p>
                </>
              ) : null}
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
          ) : null}
        </article>
      )}

      {!loading && !error && !result && userId && (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>暂无结果数据。</p>
      )}
    </main>
  );
}
