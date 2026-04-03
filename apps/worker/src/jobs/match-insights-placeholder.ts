import type { MatchInsights } from "@peima/shared/types";
import {
  P1_DISCLAIMER,
  P1_MARK,
} from "@peima/shared/constants";
import type {
  CandidateUserLike,
  ScoreComponentsV1,
} from "./matching-score.js";

/** Rule-based / mock copy for P1-1 (no AI). */
export function buildMatchInsightsPlaceholder(
  components: ScoreComponentsV1,
  candidate: CandidateUserLike,
): MatchInsights {
  const { previewPoolScore, preferenceScore, styleScore, profileScore } =
    components;
  const city = candidate.city?.trim() || "同城";
  const goal = candidate.relationshipGoal?.trim() || "关系目标";

  const strengths: string[] = [];
  if (previewPoolScore >= 0.5) {
    strengths.push(`预览池排序与基础分相对靠前${P1_MARK}`);
  }
  if (preferenceScore >= 0.6) {
    strengths.push(`硬性偏好维度命中较多${P1_MARK}`);
  }
  if (styleScore >= 0.4) {
    strengths.push(`风格标签有一定重合${P1_MARK}`);
  }
  if (profileScore >= 0.55) {
    strengths.push(`问卷画像维度较接近${P1_MARK}`);
  }
  if (strengths.length === 0) {
    strengths.push(`综合得分在当前批次候选中最高${P1_MARK}`);
  }

  const cautions: string[] = [];
  if (preferenceScore < 0.35) {
    cautions.push(`偏好匹配度偏低，线下需再确认底线条件${P1_MARK}`);
  }
  if (profileScore < 0.45) {
    cautions.push(`相处节奏/表达习惯可能存在差异${P1_MARK}`);
  }
  if (cautions.length === 0) {
    cautions.push(`仍需线下沟通验证真实相处感受${P1_MARK}`);
  }

  const riskFlags: string[] = [];
  if (preferenceScore < 0.3) {
    riskFlags.push("PREF_ALIGNMENT_LOW");
  }
  if (profileScore < 0.35) {
    riskFlags.push("PROFILE_GAP");
  }
  if (riskFlags.length === 0) {
    riskFlags.push("NONE_PLACEHOLDER");
  }

  const openingTopics: string[] = [
    `${city}周末通常怎么安排？`,
    `关于「${goal}」，你更希望的节奏是？`,
    "最近一件让你开心的小事？",
  ];

  const whyMatch = `当前批次内综合分最高：预览=${previewPoolScore.toFixed(
    2,
  )}，偏好=${preferenceScore.toFixed(2)}，风格=${styleScore.toFixed(
    2,
  )}，画像=${profileScore.toFixed(2)}。${P1_DISCLAIMER}`;

  let rhythmPrediction = `初期互动可能偏理性确认型，熟悉后节奏或加快${P1_MARK}。`;
  if (profileScore >= 0.6) {
    rhythmPrediction = `画像接近时，磨合成本可能相对较低${P1_MARK}。`;
  } else if (profileScore < 0.45) {
    rhythmPrediction = `画像差异较大时，建议放慢节奏、明确边界${P1_MARK}。`;
  }

  const chatSimulationSummary = `若两人先聊城市生活与近期状态，更容易建立轻松开场；深度议题建议延后。${P1_DISCLAIMER}`;

  return {
    explanation: {
      whyMatch,
      strengths,
      cautions,
      rhythmPrediction,
    },
    riskFlags,
    openingTopics,
    chatSimulationSummary,
  };
}
