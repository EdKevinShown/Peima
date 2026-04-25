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

export type InteractionSimulationLiteAxesDto = {
  pickupEase: LiteAxis3;
  coldFieldRisk: LiteAxisRisk;
  misunderstandingRisk: LiteAxisRisk;
  continuationSignal: LiteAxis3;
};

export type InteractionSimulationLiteOverallDto = {
  verdict: LiteOverallVerdict;
  summary: string;
  confidence: LiteConfidence;
};

export type InteractionSimulationLiteDebugDto = {
  sourceType: string;
  sourceVersion: string;
  fallbackUsed: boolean;
  meta?: {
    reason?:
      | "disabled"
      | "missing_config"
      | "timeout"
      | "http_error"
      | "invalid_json"
      | "network"
      | "unknown";
    provider?: string;
    model?: string;
  };
};

export type InteractionSimulationLiteResponseDto = {
  matchResultId: string;
  viewerUserId: string;
  candidateUserId: string;
  reviewStaticScore: number;
  axes: InteractionSimulationLiteAxesDto;
  overall: InteractionSimulationLiteOverallDto;
  debug: InteractionSimulationLiteDebugDto;
};
