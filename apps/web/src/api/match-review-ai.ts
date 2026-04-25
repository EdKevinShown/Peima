import { authHeaders, baseUrl, handleJson } from "./auth";

export type AiMatchReviewRecommendation =
  | "strong_match"
  | "match"
  | "cautious_match"
  | "not_recommended";

export type AiMatchReviewBand = "high" | "medium" | "low";

export type AiMatchReview = {
  finalScore: number;
  recommendation: AiMatchReviewRecommendation;
  conversationPotential: AiMatchReviewBand;
  longTermPotential: AiMatchReviewBand;
  strengths: string[];
  risks: string[];
  explanation: string;
  confidence: "high" | "medium" | "low";
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

export type MatchReviewResponse = {
  viewerUserId: string;
  candidateUserId: string;
  matchResultId: string;
  reviewStaticScore: number;
  staticSummary: {
    majorFits: string[];
    majorRisks: string[];
    dimensionHighlights: unknown[];
    labelFitSummary: string;
    confidenceSummary: string;
  };
  aiReview: AiMatchReview;
  debug: MatchReviewDebugPayload;
};

/** POST /match-review-ai/review — JWT；body 仅 candidateUserId（须等于当前用户最新 MatchResult）。 */
export async function postMatchReviewAi(candidateUserId: string) {
  const res = await fetch(`${baseUrl}/match-review-ai/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ candidateUserId }),
  });
  return handleJson<MatchReviewResponse>(res);
}
