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
import { readValidatedFinalMatchConsumptionHint } from "../utils/finalMatchConsumptionHintStorage";
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

const SHORTLIST_SCENE_KEYS_V0 = [
  "first_message_opening",
  "pace_negotiation",
  "boundary_conflict_response",
  "misunderstanding_repair",
  "long_term_lifestyle_alignment",
  "values_commitment_conflict",
  "re_engagement_after_lull",
  "emotional_support_under_stress",
  "friends_family_integration_boundary",
  "future_planning_tradeoff",
];

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

function parseShortlistScenariosV0(job, shortlistFourDimSidecar, shortlistDecisionSidecar) {
  if (!job || typeof job !== "object") return { state: "unavailable" };
  const scenarios = job.shortlistScenariosV0;
  if (!scenarios || typeof scenarios !== "object" || Array.isArray(scenarios)) {
    return { state: "unavailable" };
  }
  const s = scenarios;
  const schemaVersion = typeof s.schemaVersion === "string" ? s.schemaVersion : "";
  const shortlistFingerprint =
    typeof s.shortlistFingerprint === "string" ? s.shortlistFingerprint : "";
  const rawScenes = Array.isArray(s.scenes) ? s.scenes : [];
  const scenes = rawScenes
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const r = row;
      if (
        typeof r.sceneKey !== "string" ||
        typeof r.candidateUserId !== "string" ||
        typeof r.score !== "number" ||
        Number.isNaN(r.score)
      ) {
        return null;
      }
      if (r.status !== "succeeded" && r.status !== "failed") return null;
      return {
        sceneKey: r.sceneKey,
        candidateUserId: r.candidateUserId,
        score: r.score,
        status: r.status,
      };
    })
    .filter(Boolean);

  if (!schemaVersion || !shortlistFingerprint || scenes.length === 0 || scenes.length !== rawScenes.length) {
    return { state: "invalid", reason: "数据异常/不可用" };
  }

  const grouped = new Map();
  for (const row of scenes) {
    if (!SHORTLIST_SCENE_KEYS_V0.includes(row.sceneKey)) {
      return { state: "invalid", reason: "数据异常/不可用" };
    }
    if (!grouped.has(row.candidateUserId)) grouped.set(row.candidateUserId, []);
    grouped.get(row.candidateUserId).push(row.sceneKey);
  }
  for (const [, keys] of grouped) {
    if (keys.length !== SHORTLIST_SCENE_KEYS_V0.length) {
      return { state: "invalid", reason: "数据异常/不可用" };
    }
    const keySet = new Set(keys);
    if (keySet.size !== SHORTLIST_SCENE_KEYS_V0.length) {
      return { state: "invalid", reason: "数据异常/不可用" };
    }
    for (const expected of SHORTLIST_SCENE_KEYS_V0) {
      if (!keySet.has(expected)) {
        return { state: "invalid", reason: "数据异常/不可用" };
      }
    }
  }

  const fourDimFp =
    shortlistFourDimSidecar?.state === "ok" ? shortlistFourDimSidecar.shortlistFingerprint : null;
  const decisionFp =
    shortlistDecisionSidecar?.state === "ok" ? shortlistDecisionSidecar.shortlistFingerprint : null;
  const fingerprintConsistentWithFourDim = !fourDimFp || fourDimFp === shortlistFingerprint;
  const fingerprintConsistentWithDecision = !decisionFp || decisionFp === shortlistFingerprint;

  return {
    state: "ok",
    schemaVersion,
    shortlistFingerprint,
    scenes,
    fingerprintConsistentWithFourDim,
    fingerprintConsistentWithDecision,
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

/** Human labels for scene keys — card copy only; never shown as raw keys to users. */
const SHORTLIST_SCENE_TITLE_ZH = {
  first_message_opening: "开场寒暄",
  pace_negotiation: "聊天节奏",
  boundary_conflict_response: "边界与冲突",
  misunderstanding_repair: "误会与修复",
  long_term_lifestyle_alignment: "长期生活习惯",
  values_commitment_conflict: "价值观与承诺",
  re_engagement_after_lull: "冷场后再联系",
  emotional_support_under_stress: "压力下的支持",
  friends_family_integration_boundary: "朋友与家人边界",
  future_planning_tradeoff: "未来规划取舍",
};

const DIM_LABEL_ZH = {
  openingSmoothness: "开场自然度",
  continuation: "继续了解",
  conflictRisk: "互动摩擦信号",
  longTermStability: "长期磨合空间",
};

const OPENING_SCENE_PICK_KEYS = ["first_message_opening", "misunderstanding_repair", "pace_negotiation"];

/**
 * Phase E v1.0 — stable natural-language lines from sidecars (no sceneKey / fingerprint in output).
 * @returns {null | { summary: string, compatibilityLines: string[], reminder: string, opening: string }}
 */
function buildPhaseEAssistCopy(job, candidateUserId, decision, fourDim, scenarios) {
  if (
    !candidateUserId ||
    decision.state !== "ok" ||
    fourDim.state !== "ok" ||
    scenarios.state !== "ok" ||
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

  const scenesForCur = scenarios.scenes.filter((s) => s.candidateUserId === candidateUserId && s.status === "succeeded");
  let opening = "开场建议：先从近况、轻松话题或共同兴趣聊起，少用「你应该」式表达，给对方接话空间。";
  let best = null;
  for (const sk of OPENING_SCENE_PICK_KEYS) {
    const hit = scenesForCur.filter((s) => s.sceneKey === sk);
    for (const s of hit) {
      if (!best || s.score > best.score) best = s;
    }
  }
  if (best && SHORTLIST_SCENE_TITLE_ZH[best.sceneKey]) {
    const t = SHORTLIST_SCENE_TITLE_ZH[best.sceneKey];
    opening = `开场建议：从「${t}」相关角度切入往往更自然——先分享一点近况或轻松观察，少用结论式表达。`;
  } else {
    const matched = Array.isArray(job?.results)
      ? job.results.find((r) => r.candidateUserId === candidateUserId)
      : null;
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

/** Phase E v1.0 — user-facing assist card (distinct from internal purple AI layer). */
const phaseEAssistCardShell = {
  marginTop: "1.05rem",
  padding: "1.05rem 1.1rem 1.15rem",
  borderRadius: 11,
  border: "1px solid #93c5fd",
  background: "linear-gradient(180deg, #eff6ff 0%, #ffffff 52%)",
  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.07)",
};

const phaseEAssistChip = {
  display: "inline-block",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: "#1d4ed8",
  background: "rgba(219, 234, 254, 0.95)",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "0.22rem 0.6rem",
  marginBottom: "0.55rem",
};

const phaseEAssistSectionTitle = {
  margin: "0.85rem 0 0.4rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#1e40af",
};

const phaseEAssistBody = {
  margin: 0,
  lineHeight: 1.65,
  color: "#334155",
  fontSize: "0.9rem",
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
  const shortlistDecisionSidecar = useMemo(() => parseShortlistDecisionV0(aiSimJob), [aiSimJob]);
  const shortlistFourDimSidecar = useMemo(
    () => parseShortlistFourDimV0(aiSimJob, shortlistDecisionSidecar),
    [aiSimJob, shortlistDecisionSidecar],
  );
  const shortlistScenariosSidecar = useMemo(
    () => parseShortlistScenariosV0(aiSimJob, shortlistFourDimSidecar, shortlistDecisionSidecar),
    [aiSimJob, shortlistFourDimSidecar, shortlistDecisionSidecar],
  );
  const jobAuditSidecar = useMemo(() => parseJobAuditV0(aiSimJob), [aiSimJob]);

  const phaseEAssistCard = useMemo(() => {
    if (!aiSimJobId?.trim()) return { visible: false, copy: null };
    if (aiSimJobLoading || aiSimJobError || !aiSimJob) return { visible: false, copy: null };
    if (aiSimJob.jobStatus !== "completed") return { visible: false, copy: null };
    if (!jobAuditAllowsPhaseEAssistCard(jobAuditSidecar)) return { visible: false, copy: null };
    const copy = buildPhaseEAssistCopy(
      aiSimJob,
      result?.candidateUserId || "",
      shortlistDecisionSidecar,
      shortlistFourDimSidecar,
      shortlistScenariosSidecar,
    );
    if (!copy) return { visible: false, copy: null };
    return { visible: true, copy };
  }, [
    aiSimJobId,
    aiSimJobLoading,
    aiSimJobError,
    aiSimJob,
    jobAuditSidecar,
    result?.candidateUserId,
    shortlistDecisionSidecar,
    shortlistFourDimSidecar,
    shortlistScenariosSidecar,
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

  useEffect(() => {
    if (!aiSimJobId) {
      setConsumptionHint(null);
      return;
    }
    setConsumptionHint(readValidatedFinalMatchConsumptionHint(aiSimJobId));
  }, [aiSimJobId]);

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
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "1rem 1rem 2.5rem" }}>
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
          AI 场景证据侧车（shortlistScenariosV0，内部只读）
        </summary>
        <div style={{ marginTop: "0.5rem", lineHeight: 1.55 }}>
          {!aiSimJobId || aiSimJobLoading || aiSimJobError || shortlistScenariosSidecar.state === "unavailable" ? (
            <p style={{ margin: 0 }}>AI 场景证据侧车暂不可用。</p>
          ) : shortlistScenariosSidecar.state === "invalid" ? (
            <p style={{ margin: 0, color: "#92400e" }}>{shortlistScenariosSidecar.reason}</p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.25rem" }}>
                schemaVersion：<code style={{ fontSize: "0.74rem" }}>{shortlistScenariosSidecar.schemaVersion}</code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                shortlistFingerprint：
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all", marginLeft: "0.25rem" }}>
                  {shortlistScenariosSidecar.shortlistFingerprint}
                </code>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                场景结构可读（每候选恰好固定场景集合）：
                <strong style={{ color: "#166534", marginLeft: "0.25rem" }}>是</strong>
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                与 shortlistFourDimV0/shortlistDecisionV0 指纹一致性：
                <strong
                  style={{
                    color:
                      shortlistScenariosSidecar.fingerprintConsistentWithFourDim &&
                      shortlistScenariosSidecar.fingerprintConsistentWithDecision
                        ? "#166534"
                        : "#92400e",
                    marginLeft: "0.25rem",
                  }}
                >
                  {shortlistScenariosSidecar.fingerprintConsistentWithFourDim &&
                  shortlistScenariosSidecar.fingerprintConsistentWithDecision
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
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        sceneKey
                      </th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        score
                      </th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortlistScenariosSidecar.scenes.map((row, idx) => (
                      <tr key={`${row.candidateUserId}-${row.sceneKey}-${idx}`}>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          <code style={{ fontSize: "0.72rem" }}>{row.candidateUserId}</code>
                        </td>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          <code style={{ fontSize: "0.72rem" }}>{row.sceneKey}</code>
                        </td>
                        <td style={{ textAlign: "right", padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {row.score.toFixed(4)}
                        </td>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
                本场景证据用于汇总到 shortlistFourDimV0，再支撑 shortlistDecisionV0。
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
          AI 四维侧车（shortlistFourDimV0，内部只读）
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
          AI 决胜侧车（shortlistDecisionV0，内部只读）
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
          编排 consumption hint（内部，sessionStorage）
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

          {phaseEAssistCard.visible && phaseEAssistCard.copy ? (
            <section style={phaseEAssistCardShell} aria-label="短名单对话模拟互动参考">
              <span style={phaseEAssistChip}>模拟观察 · 仅供参考</span>
              <h2 style={{ fontSize: "1.08rem", margin: "0 0 0.35rem", color: "#0f172a", fontWeight: 700 }}>
                互动参考（短名单对话模拟）
              </h2>
              <p style={{ margin: "0 0 0.65rem", fontSize: "0.84rem", color: "#475569", lineHeight: 1.55 }}>
                以下为辅助理解与互动建议，不替代上方匹配指数与系统结论，也不代表对方或关系的「最终评价」。
              </p>
              <p style={{ ...phaseEAssistBody, fontWeight: 500, color: "#1e293b" }}>{phaseEAssistCard.copy.summary}</p>
              <h3 style={phaseEAssistSectionTitle}>兼容性提示</h3>
              <ul
                style={{
                  margin: "0 0 0.15rem",
                  paddingLeft: "1.15rem",
                  lineHeight: 1.65,
                  color: "#334155",
                  fontSize: "0.9rem",
                }}
              >
                {phaseEAssistCard.copy.compatibilityLines.map((line, i) => (
                  <li key={`phase-e-compat-${i}`} style={{ marginBottom: "0.35rem" }}>
                    {line}
                  </li>
                ))}
              </ul>
              <h3 style={phaseEAssistSectionTitle}>相处建议</h3>
              <p style={phaseEAssistBody}>{phaseEAssistCard.copy.reminder}</p>
              <h3 style={phaseEAssistSectionTitle}>开场建议</h3>
              <p style={{ ...phaseEAssistBody, marginBottom: 0 }}>{phaseEAssistCard.copy.opening}</p>
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
            {aiSimJobId &&
            result?.candidateUserId &&
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
                  key={`${aiSimJobId || "no-job"}-${result.candidateUserId || ""}`}
                  aiSimJobId={aiSimJobId}
                  candidateUserId={result.candidateUserId}
                  job={aiSimJob}
                  jobLoading={aiSimJobLoading}
                  jobError={aiSimJobError}
                  onRefresh={loadAiSimJob}
                />
              </>
            ) : null}
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
