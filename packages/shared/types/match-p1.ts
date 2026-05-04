/** P1-1 structured insights on MatchResult.matchInsights (JSON). Key names are contract. */

/** M6.0-E: worker-written shadow; optional on older rows. */
export type MatchInsightsScoreShadowM60 = {
  finalScoreV1: number;
  relationshipProfileScore: number;
  scoringVersion: "m6.0-profile-score-shadow-v1";
};

export type MatchInsights = {
  explanation: {
    whyMatch: string;
    strengths: string[];
    cautions: string[];
    rhythmPrediction: string;
  };
  riskFlags: string[];
  openingTopics: string[];
  chatSimulationSummary: string;
  scoreShadow?: MatchInsightsScoreShadowM60;
};
