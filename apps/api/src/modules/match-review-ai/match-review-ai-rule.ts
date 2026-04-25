import type { AiMatchReview, MatchReviewStaticSummaryPayload } from "./match-review-ai.types";

/**
 * P6.x 规则层复审快照（与 `MatchReviewAiService` 原私有逻辑一致），供 Match Review POST 与 P6.z Readout Fusion 共用。
 */
export function buildRuleAiMatchReview(
  reviewStaticScore: number,
  staticSummary: MatchReviewStaticSummaryPayload,
): AiMatchReview {
  let recommendation: AiMatchReview["recommendation"];
  if (reviewStaticScore >= 78) recommendation = "strong_match";
  else if (reviewStaticScore >= 58) recommendation = "match";
  else if (reviewStaticScore >= 40) recommendation = "cautious_match";
  else recommendation = "not_recommended";

  const conversationPotential: AiMatchReview["conversationPotential"] =
    reviewStaticScore >= 62 ? "high" : reviewStaticScore >= 45 ? "medium" : "low";
  const longTermPotential: AiMatchReview["longTermPotential"] =
    reviewStaticScore >= 65 ? "high" : reviewStaticScore >= 42 ? "medium" : "low";

  const strengths = staticSummary.majorFits.slice(0, 6);
  const risks = staticSummary.majorRisks.slice(0, 6);
  const explanation = [
    staticSummary.labelFitSummary,
    "",
    `静态复审分（reviewStaticScore）为 ${reviewStaticScore}，用于辅助理解问卷画像层面的接近度；与系统最终匹配 worker 分数无强制对齐。`,
    "",
    staticSummary.confidenceSummary,
  ].join("\n");

  const confidence: AiMatchReview["confidence"] =
    reviewStaticScore >= 55 && strengths.length >= 2 ? "medium" : "low";

  return {
    finalScore: reviewStaticScore,
    recommendation,
    conversationPotential,
    longTermPotential,
    strengths,
    risks,
    explanation,
    confidence,
  };
}
