/** P1-1 structured insights on MatchResult.matchInsights (JSON). Key names are contract. */

/** M6.0-E: worker-written shadow; optional on older rows. */
export type MatchInsightsScoreShadowM60 = {
  finalScoreV1: number;
  relationshipProfileScore: number;
  scoringVersion: "m6.0-profile-score-shadow-v1";
};

/** M6.0-J3: worker-written V2 shadow; optional on older rows. */
export type MatchInsightsScoreShadowV2 = {
  scoringVersion: "m6.0-relationship-profile-score-v2-shadow";
  rawCompatibilityScore: number;
  weightedBaseScore: number;
  penaltyTotal: number;
  cappedRawScore: number;
  displayScore100: number;
  band: "strong_conflict" | "low" | "medium" | "good" | "high";
  capApplied: number | null;
  coreConflictCount: number;
  strongConflictCount: number;
  redFlagConflictCount: number;
  validAxisCount: number;
  skippedAxisCount: number;
  source: "profile_v2_shadow" | "insufficient_profile";
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
  scoreShadowV2?: MatchInsightsScoreShadowV2;
};
