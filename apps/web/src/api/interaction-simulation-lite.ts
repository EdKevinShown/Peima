import { authHeaders, baseUrl, handleJson } from "./auth";

export type LiteBand3 = "high" | "medium" | "low";
export type LiteRiskBand = "low" | "medium" | "high";
export type LiteConfidence = "high" | "medium" | "low";

export type LiteAxis3 = {
  band: LiteBand3;
  oneLiner: string;
  confidence: LiteConfidence;
};

export type LiteAxisRisk = {
  band: LiteRiskBand;
  oneLiner: string;
  confidence: LiteConfidence;
};

export type LiteOverallVerdict = "worth_exploring" | "cautious" | "pause";

export type InteractionSimulationLiteResponse = {
  matchResultId: string;
  viewerUserId: string;
  candidateUserId: string;
  reviewStaticScore: number;
  axes: {
    pickupEase: LiteAxis3;
    coldFieldRisk: LiteAxisRisk;
    misunderstandingRisk: LiteAxisRisk;
    continuationSignal: LiteAxis3;
  };
  overall: {
    verdict: LiteOverallVerdict;
    summary: string;
    confidence: LiteConfidence;
  };
  debug: {
    sourceType: string;
    sourceVersion: string;
    fallbackUsed: boolean;
    meta?: {
      reason?: string;
      provider?: string;
      model?: string;
    };
  };
};

/** GET /interaction-simulation-lite/match-results/:matchResultId — JWT；viewer 须为该 MatchResult 的 userId。 */
export async function getInteractionSimulationLite(matchResultId: string) {
  const url = `${baseUrl}/interaction-simulation-lite/match-results/${encodeURIComponent(matchResultId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<InteractionSimulationLiteResponse>(res);
}
