import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getMatchingResult } from "../api/matching";
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
import FinalMatchTechnicalDetails from "../components/final-match/FinalMatchTechnicalDetails";

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

/** Phase E v1.0 — consumer assist card gate (values align with API jobAuditV0). */
const JOB_AUDIT_SPEC_CURRENT_SHORTLIST = "current_shortlist_contract";
const JOB_AUDIT_DIAG_CURRENT_OK = "current_ok";
const JOB_AUDIT_BUILD_NONE = "none";

function jobAuditAllowsPhaseEAssistCard(audit) {
  if (audit.state !== "ok") return false;
  if (!audit.shortlistBindingPresent || !audit.sidecarTrioPresent) return false;
  if (audit.rankConsistent !== true) return false;
  if (audit.specClassification !== JOB_AUDIT_SPEC_CURRENT_SHORTLIST) return false;
  if (audit.diagnosticBucket !== JOB_AUDIT_DIAG_CURRENT_OK) return false;
  if (audit.buildabilityDetail !== JOB_AUDIT_BUILD_NONE) return false;
  return true;
}

const DIM_LABEL_ZH = {
  openingSmoothness: "开场自然度",
  continuation: "继续了解",
  conflictRisk: "互动摩擦信号",
  longTermStability: "长期磨合空间",
};

/**
 * Phase E v1.0 — stable natural-language lines from sidecars (no sceneKey / fingerprint in output).
 * @returns {null | { summary: string, compatibilityLines: string[], reminder: string, opening: string }}
 */
function buildPhaseEAssistCopy(job, candidateUserId, decision, fourDim) {
  if (
    !candidateUserId ||
    decision.state !== "ok" ||
    fourDim.state !== "ok" ||
    !decision.rankedCandidateUserIds.includes(candidateUserId)
  ) {
    return null;
  }

  const tier = decision.confidenceTier;
  let summary =
    "基于短名单的多场景对话模拟，整理了一份「互动参考」：侧重聊天节奏与相处感受，便于你带着更轻松的心态去接触对方。";
  if (tier === "high") {
    summary =
      "短名单对话模拟里，双方互动信号相对清晰，可作为「怎么聊、聊什么」的轻量参考——仍请以真实相处为准。";
  } else if (tier === "medium") {
    summary =
      "短名单对话模拟给出的信号中等强度，更适合当作聊天前的「相处提示」，不必过度解读为结果好坏。";
  } else if (tier === "low") {
    summary =
      "短名单对话模拟覆盖有限，下面的句子只作相处与开场的辅助提示，请更多依赖线下真实感受。";
  }

  const curRow = fourDim.candidateDimensions.find((r) => r.candidateUserId === candidateUserId);
  if (!curRow) return null;

  const n = fourDim.candidateDimensions.length;
  const mean = (pick) =>
    fourDim.candidateDimensions.reduce((s, r) => s + Number(r[pick]), 0) / Math.max(1, n);

  const dims = ["openingSmoothness", "continuation", "longTermStability", "conflictRisk"];
  const margins = dims.map((key) => {
    const m = mean(key);
    const cur = Number(curRow[key]);
    if (key === "conflictRisk") {
      return { key, margin: m - cur, higherIsBetter: false };
    }
    return { key, margin: cur - m, higherIsBetter: true };
  });
  margins.sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin));

  const compatibilityLines = [];
  for (const row of margins) {
    if (compatibilityLines.length >= 3) break;
    if (Math.abs(row.margin) < 0.02) continue;
    const label = DIM_LABEL_ZH[row.key];
    if (!label) continue;
    if (row.key === "conflictRisk") {
      compatibilityLines.push(
        row.margin > 0.02
          ? `模拟观察：相对短名单整体，与你相关的「${label}」略低一些，通常意味着互动里可更从容确认彼此感受。`
          : `模拟观察：相对短名单整体，与你相关的「${label}」略高一些，可作为聊天节奏上的轻量提醒（非对错判断）。`,
      );
    } else {
      compatibilityLines.push(
        row.margin > 0.02
          ? `模拟观察：与你相关的「${label}」在短名单里相对更顺一些，可作为「从哪里聊起更自然」的参考。`
          : `模拟观察：与你相关的「${label}」在短名单里不算突出，聊天时不妨多给对方接话与确认的空间。`,
      );
    }
  }
  if (compatibilityLines.length < 2) {
    compatibilityLines.push(
      "模拟观察：短名单内的差异主要体现在聊天节奏与感受表达上，下面的开场建议可当作轻量提示使用。",
    );
  }
  if (compatibilityLines.length < 2) {
    compatibilityLines.push(
      "模拟观察：可把重点放在「聊得舒服」而非「谁更对」，更容易形成自然的互动节奏。",
    );
  }

  const meanRisk = mean("conflictRisk");
  let reminder =
    "相处建议：模拟只覆盖部分话题，真实相处请以彼此节奏与边界为准；遇到不确定时，慢一点、多问一句往往更稳。";
  if (curRow.conflictRisk > meanRisk + 0.04) {
    reminder =
      "相处建议：模拟里「互动摩擦信号」略高一点，并不代表不合适，更像是提醒聊天时少下结论、多确认对方感受。";
  }

  const matched = Array.isArray(job?.results)
    ? job.results.find((r) => r.candidateUserId === candidateUserId)
    : null;
  const tl = matched?.transcriptLite;
  let opening = "开场建议：先从近况、轻松话题或共同兴趣聊起，少用「你应该」式表达，给对方接话空间。";
  if (
    tl &&
    typeof tl === "object" &&
    !Array.isArray(tl) &&
    tl.schemaVersion === 2 &&
    tl.overallSimulationAssessment &&
    typeof tl.overallSimulationAssessment.recommendedOpeningStyle === "string" &&
    tl.overallSimulationAssessment.recommendedOpeningStyle.trim()
  ) {
    opening = `开场建议：${tl.overallSimulationAssessment.recommendedOpeningStyle.trim()}`;
  } else {
    const ev = matched?.evaluator;
    if (ev && typeof ev === "object" && !Array.isArray(ev) && Array.isArray(ev.mitigation_hints) && ev.mitigation_hints[0]) {
      const h0 = ev.mitigation_hints[0];
      if (typeof h0 === "string" && h0.trim().length > 0 && h0.length < 120) {
        opening = `开场建议：${h0.trim()}`;
      }
    }
  }

  return { summary, compatibilityLines: compatibilityLines.slice(0, 3), reminder, opening };
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

const aiLayerShell = {
  marginTop: "1.75rem",
  padding: "1.25rem 1.15rem 1.35rem",
  borderRadius: 12,
  border: "1px solid #c7d2fe",
  background: "linear-gradient(180deg, #eef2ff 0%, #ffffff 28%)",
  boxShadow: "0 2px 8px rgba(67,56,202,0.08)",
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
  /** M3.8-M13: 展示与下游 API（复审 / 侧车）一致用 displayCandidateUserId，无则回退 MatchResult.candidateUserId。 */
  const effectiveDisplayCandidateId = useMemo(
    () => String(result?.displayCandidateUserId || result?.candidateUserId || "").trim(),
    [result?.displayCandidateUserId, result?.candidateUserId],
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

  const phaseEAssistCard = useMemo(() => {
    if (!aiSimJobId?.trim()) return { visible: false, copy: null };
    if (aiSimJobLoading || aiSimJobError || !aiSimJob) return { visible: false, copy: null };
    if (aiSimJob.jobStatus !== "completed") return { visible: false, copy: null };
    if (!jobAuditAllowsPhaseEAssistCard(jobAuditSidecar)) return { visible: false, copy: null };
    const copy = buildPhaseEAssistCopy(
      aiSimJob,
      effectiveDisplayCandidateId,
      shortlistDecisionSidecar,
      shortlistFourDimSidecar,
    );
    if (!copy) return { visible: false, copy: null };
    return { visible: true, copy };
  }, [
    aiSimJobId,
    aiSimJobLoading,
    aiSimJobError,
    aiSimJob,
    jobAuditSidecar,
    effectiveDisplayCandidateId,
    shortlistDecisionSidecar,
    shortlistFourDimSidecar,
  ]);

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
      {loading && <LoadingState label="加载匹配结果…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && result && (
        <article>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
            <Link
              to={`/matching-waiting?userId=${encodeURIComponent(userId || "")}`}
              style={{ fontSize: "0.82rem", color: "#64748b", whiteSpace: "nowrap" }}
            >
              返回等待页
            </Link>
          </div>
          <FinalMatchHero
            readoutFusion={readoutFusion}
            matchInsights={isValidMatchInsights(result.matchInsights) ? result.matchInsights : null}
            finalScore={result.finalScore}
            createdAt={result.createdAt}
            formatScoreDisplay={formatScoreDisplay}
            formatDateShort={formatDateShort}
          />
          {!isValidMatchInsights(result.matchInsights) && readoutFusion?.headlineZh?.trim() ? (
            <section
              style={{
                marginTop: "1.1rem",
                padding: "0.85rem 1rem",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
              aria-label="读数摘要"
            >
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#334155", lineHeight: 1.55 }}>{readoutFusion.headlineZh}</p>
              {Array.isArray(readoutFusion.bulletsZh) && readoutFusion.bulletsZh.length > 0 ? (
                <ul style={{ margin: "0.55rem 0 0", paddingLeft: "1.1rem", color: "#475569", fontSize: "0.86rem", lineHeight: 1.55 }}>
                  {readoutFusion.bulletsZh.slice(0, 4).map((line, i) => (
                    <li key={`fb-fallback-${i}`} style={{ marginBottom: "0.25rem" }}>
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          {!isValidMatchInsights(result.matchInsights) && !readoutFusion?.headlineZh?.trim() ? (
            <p style={{ marginTop: "1rem", color: "#64748b", fontSize: "0.9rem", lineHeight: 1.55 }}>
              暂无可读的结构化匹配解读；你仍可使用下方可选功能或联系支持。
            </p>
          ) : null}
          {isValidMatchInsights(result.matchInsights) ? (
            <FinalMatchExplanationSections
              readoutFusion={readoutFusion}
              insights={result.matchInsights}
              finalMatchDecisionMeta={result.finalMatchDecisionMeta}
              matchReview={matchReview}
              matchReviewLoading={matchReviewLoading}
              matchReviewError={matchReviewError}
              onFetchMatchReview={onFetchMatchReview}
              effectiveDisplayCandidateId={effectiveDisplayCandidateId}
              matchReviewRecommendationLabel={matchReviewRecommendationLabel}
              matchReviewPotentialSentence={matchReviewPotentialSentence}
              matchReviewConfidenceSentence={matchReviewConfidenceSentence}
              formatScoreDisplay={formatScoreDisplay}
              interactionSim={interactionSim}
              interactionSimLoading={interactionSimLoading}
              interactionSimError={interactionSimError}
              onFetchInteractionSim={onFetchInteractionSim}
              resultId={result.id}
              phaseEAssistCard={phaseEAssistCard}
              formatLiteBand3Zh={formatLiteBand3Zh}
              formatLiteRiskBandZh={formatLiteRiskBandZh}
              formatLiteVerdictZh={formatLiteVerdictZh}
            />
          ) : null}

          <section style={aiLayerShell} aria-label="模拟与补充解读">
            {aiSimJobId &&
            effectiveDisplayCandidateId &&
            (aiSimJobLoading || aiSimJob != null || aiSimJobError != null) ? (
              <>
                <p
                  style={{
                    margin: "0 0 0.65rem",
                    fontSize: "0.78rem",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  以下为基于模拟的<strong>互动与相处参考</strong>（与上方主结果独立）；无说明引用时不显示本块。
                </p>
                <AiSimulationSidecarV0
                  key={`${aiSimJobId || "no-job"}-${effectiveDisplayCandidateId || ""}`}
                  aiSimJobId={aiSimJobId}
                  candidateUserId={effectiveDisplayCandidateId}
                  job={aiSimJob}
                  jobLoading={aiSimJobLoading}
                  jobError={aiSimJobError}
                  onRefresh={loadAiSimJob}
                />
              </>
            ) : null}
            <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.35rem", color: "#312e81", fontWeight: 700 }}>
              可选：模拟侧车与补充解读
            </h2>
            <p style={{ margin: "0 0 1rem", color: "#4c1d95", fontSize: "0.86rem", lineHeight: 1.55, opacity: 0.92 }}>
              与上方主说明独立；适合想多看一层参考时使用。
            </p>

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

          <FinalMatchTechnicalDetails
            displaySourceType={result.displaySourceType}
            finalMatchDecisionMeta={result.finalMatchDecisionMeta}
            readoutFusion={readoutFusion}
          />

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

          {/* —— 底部行动区 —— */}
          <footer
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, maxWidth: 440 }}>
              <strong>下一步：</strong>与对方开始聊天；时间线与刷新为可选辅助。
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
        </article>
      )}

      {!loading && !error && !result && userId && (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>暂无结果数据。</p>
      )}
    </main>
  );
}
