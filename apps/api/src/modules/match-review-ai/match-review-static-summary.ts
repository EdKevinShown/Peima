import type { UserProfile } from "@peima/database";
import { G1R_PROFILE_KEYS } from "../questionnaire/questionnaire.scorer";
import type { QuestionnaireProfileView } from "../questionnaire/questionnaire.service";
import type {
  MatchReviewDimensionHighlight,
  MatchReviewStaticSummaryPayload,
} from "./match-review-ai.types";

/** 与前端 `QuestionnaireProfilePage` 轴标题对齐（仅用于摘要文案）。 */
const AXIS_LABEL_ZH: Record<string, string> = {
  attachmentStyle: "依恋风格",
  emotionalExpression: "情绪表达",
  communicationStyle: "沟通风格",
  conflictHandling: "冲突处理",
  loveLanguage: "爱的语言",
  securityNeed: "安全感需求",
  controlNeed: "控制需求",
  independence: "独立性",
  loyaltyView: "忠诚观",
  jealousyTendency: "嫉妒倾向",
  moneyAttitude: "金钱观",
  careerPriority: "事业优先级",
  lifePace: "生活节奏",
  socialNeed: "社交需求",
  emotionalStability: "情绪稳定性",
  sexualValues: "性价值观",
  familyView: "家庭观",
  marriageExpectation: "婚姻期待",
  childrenIntent: "生育意愿",
  riskPreference: "风险偏好",
};

function labelForKey(key: string): string {
  return AXIS_LABEL_ZH[key] ?? key;
}

function axisIdForKey(key: string): number {
  const i = G1R_PROFILE_KEYS.indexOf(key as (typeof G1R_PROFILE_KEYS)[number]);
  return i >= 0 ? i + 1 : 0;
}

/**
 * G1-R 标量相似度（与 worker `computeProfileScore` 同构，不依赖 worker 包）。
 */
function profileScalarSimilarity(
  a: UserProfile | null | undefined,
  b: UserProfile | null | undefined,
): number {
  if (!a || !b) return 0.5;
  let sum = 0;
  let n = 0;
  for (const key of G1R_PROFILE_KEYS) {
    const va = a[key as keyof UserProfile];
    const vb = b[key as keyof UserProfile];
    if (typeof va === "number" && typeof vb === "number") {
      sum += 1 - Math.abs(va - vb);
      n += 1;
    }
  }
  if (n === 0) return 0.5;
  return sum / n;
}

function dominantBranchSimilarity(
  viewer: QuestionnaireProfileView,
  candidate: QuestionnaireProfileView,
): number {
  let hit = 0;
  let total = 0;
  for (let ax = 1; ax <= 20; ax += 1) {
    const k = String(ax);
    const dv = viewer.dominantBranches[k];
    const dc = candidate.dominantBranches[k];
    if (dv != null && dv !== "" && dc != null && dc !== "") {
      total += 1;
      if (dv === dc) hit += 1;
    }
  }
  if (total === 0) return 0.5;
  return hit / total;
}

function meanConfidence(a: UserProfile, b: UserProfile): number {
  const ca = typeof a.confidence === "number" ? a.confidence : 0;
  const cb = typeof b.confidence === "number" ? b.confidence : 0;
  return Math.min(1, Math.max(0, (ca + cb) / 2));
}

export function buildMatchReviewStaticSummary(
  viewer: QuestionnaireProfileView,
  candidate: QuestionnaireProfileView,
): { reviewStaticScore: number; staticSummary: MatchReviewStaticSummaryPayload } {
  const scalarSim = profileScalarSimilarity(viewer.profile, candidate.profile);
  const domSim = dominantBranchSimilarity(viewer, candidate);
  const confMean = meanConfidence(viewer.profile, candidate.profile);
  const blend = 0.45 * scalarSim + 0.35 * domSim + 0.2 * confMean;
  const reviewStaticScore = Math.round(Math.min(100, Math.max(0, blend * 100)));

  const dimensionHighlights: MatchReviewDimensionHighlight[] = [];

  for (const key of G1R_PROFILE_KEYS) {
    const va = viewer.profile[key as keyof UserProfile];
    const vb = candidate.profile[key as keyof UserProfile];
    const axisId = axisIdForKey(key);
    const labelZh = labelForKey(key);
    if (typeof va === "number" && typeof vb === "number") {
      const sim = 1 - Math.abs(va - vb);
      if (sim >= 0.72) {
        dimensionHighlights.push({
          axisId,
          axisKey: key,
          labelZh,
          kind: "scalar_close",
          detail: `双方在「${labelZh}」上较接近（标量相似度约 ${(sim * 100).toFixed(0)}%）。`,
        });
      } else if (sim <= 0.38) {
        dimensionHighlights.push({
          axisId,
          axisKey: key,
          labelZh,
          kind: "scalar_gap",
          detail: `双方在「${labelZh}」上差异较明显，建议线下多沟通感受。`,
        });
      }
    }
    const dk = String(axisId);
    const dva = viewer.dominantBranches[dk];
    const dvb = candidate.dominantBranches[dk];
    if (
      dva != null &&
      dva !== "" &&
      dvb != null &&
      dvb !== "" &&
      dva === dvb
    ) {
      dimensionHighlights.push({
        axisId,
        axisKey: key,
        labelZh,
        kind: "dominant_match",
        detail: `双方在「${labelZh}」的主导倾向同为「${dva}」。`,
      });
    } else if (
      dva != null &&
      dva !== "" &&
      dvb != null &&
      dvb !== "" &&
      dva !== dvb
    ) {
      dimensionHighlights.push({
        axisId,
        axisKey: key,
        labelZh,
        kind: "dominant_mismatch",
        detail: `双方在「${labelZh}」的主导倾向不同（${dva} vs ${dvb}），相处时需留意节奏。`,
      });
    }
  }

  const sorted = [...dimensionHighlights].sort((x, y) => {
    const rank = (k: MatchReviewDimensionHighlight["kind"]) => {
      if (k === "scalar_close" || k === "dominant_match") return 0;
      if (k === "scalar_gap" || k === "dominant_mismatch") return 2;
      return 1;
    };
    return rank(x.kind) - rank(y.kind);
  });

  const majorFits: string[] = [];
  const majorRisks: string[] = [];
  for (const h of sorted) {
    if (
      (h.kind === "scalar_close" || h.kind === "dominant_match") &&
      majorFits.length < 5
    ) {
      majorFits.push(h.detail);
    }
    if (
      (h.kind === "scalar_gap" || h.kind === "dominant_mismatch") &&
      majorRisks.length < 5
    ) {
      majorRisks.push(h.detail);
    }
  }
  if (majorFits.length === 0) {
    majorFits.push("双方在问卷画像标量与主导倾向上未出现显著同向亮点，建议结合线下互动再判断。");
  }
  if (majorRisks.length === 0) {
    majorRisks.push("未发现强烈结构性冲突信号；仍需现实相处验证边界与节奏。");
  }

  const vn = viewer.displayPrimary?.name ?? "viewer";
  const cn = candidate.displayPrimary?.name ?? "candidate";
  const labelFitSummary = `主展示标签：你方「${vn}」与对方「${cn}」。该摘要仅基于已落库问卷画像与分支规则，不构成心理诊断。`;

  const c1 =
    typeof viewer.profile.confidence === "number"
      ? viewer.profile.confidence.toFixed(2)
      : "—";
  const c2 =
    typeof candidate.profile.confidence === "number"
      ? candidate.profile.confidence.toFixed(2)
      : "—";
  const confidenceSummary = `问卷完成度（confidence）：你方 ${c1}，对方 ${c2}（数值越高表示 canonical 题覆盖越完整）。`;

  return {
    reviewStaticScore,
    staticSummary: {
      majorFits,
      majorRisks,
      dimensionHighlights: sorted.slice(0, 12),
      labelFitSummary,
      confidenceSummary,
    },
  };
}
