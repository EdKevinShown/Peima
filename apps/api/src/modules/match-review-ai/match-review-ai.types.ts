export type AiMatchReviewRecommendation =
  | "strong_match"
  | "match"
  | "cautious_match"
  | "not_recommended";

export type AiMatchReviewBand = "high" | "medium" | "low";

export type AiMatchReviewConfidence = "high" | "medium" | "low";

/** Model / rule output — `finalScore` is 0–100 AI 复审分，与 `MatchResult.finalScore` 无关。 */
export type AiMatchReview = {
  finalScore: number;
  recommendation: AiMatchReviewRecommendation;
  conversationPotential: AiMatchReviewBand;
  longTermPotential: AiMatchReviewBand;
  strengths: string[];
  risks: string[];
  explanation: string;
  confidence: AiMatchReviewConfidence;
};

export type MatchReviewDimensionHighlight = {
  axisId: number;
  axisKey: string;
  labelZh: string;
  kind: "scalar_close" | "scalar_gap" | "dominant_match" | "dominant_mismatch";
  detail: string;
};

export type MatchReviewStaticSummaryPayload = {
  majorFits: string[];
  majorRisks: string[];
  dimensionHighlights: MatchReviewDimensionHighlight[];
  labelFitSummary: string;
  confidenceSummary: string;
};

export type MatchReviewDebugPayload = {
  matchResultFinalScore: number | null;
  sourceType: string;
  sourceVersion: string;
  fallbackUsed: boolean;
  meta?: {
    reason?: string;
    provider?: string;
    model?: string;
  };
};

export type MatchReviewResponseDto = {
  viewerUserId: string;
  candidateUserId: string;
  matchResultId: string;
  reviewStaticScore: number;
  staticSummary: MatchReviewStaticSummaryPayload;
  aiReview: AiMatchReview;
  debug: MatchReviewDebugPayload;
};
