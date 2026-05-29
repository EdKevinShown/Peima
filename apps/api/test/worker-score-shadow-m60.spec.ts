import { buildMatchInsightsPlaceholder } from "../../worker/src/jobs/match-insights-placeholder";
import {
  buildScoreShadowM60,
  computeFinalScoreV1,
} from "../../worker/src/jobs/matching-score";

describe("M6.0-E worker scoreShadow (matching-score)", () => {
  const minimalProfile = {
    attachmentStyle: 0.6,
    emotionalExpression: null,
    communicationStyle: null,
    conflictHandling: null,
    loveLanguage: null,
    securityNeed: null,
    controlNeed: null,
    independence: null,
    loyaltyView: null,
    jealousyTendency: null,
    moneyAttitude: null,
    careerPriority: null,
    lifePace: null,
    socialNeed: null,
    emotionalStability: null,
    sexualValues: null,
    familyView: null,
    marriageExpectation: null,
    childrenIntent: null,
    riskPreference: null,
  } as const;

  const params = {
    item: { baseScore: 0.8, rankInPool: 1 },
    viewerPreference: {
      minAge: 20,
      maxAge: 40,
      preferredCities: [] as string[],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
      styleTags: [] as string[],
    },
    viewerProfile: { ...minimalProfile },
    candidateUser: {
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    candidateImage: { styleTags: [] as string[] },
    candidateProfile: { ...minimalProfile, attachmentStyle: 0.8 },
  };

  it("buildScoreShadowM60 mirrors finalScore and profileScore from computeFinalScoreV1", () => {
    const components = computeFinalScoreV1(params);
    const shadow = buildScoreShadowM60(components);
    expect(shadow.finalScoreV1).toBe(components.finalScore);
    expect(shadow.relationshipProfileScore).toBe(components.profileScore);
    expect(shadow.scoringVersion).toBe("m6.0-profile-score-shadow-v1");
    expect(shadow.finalScoreV1).toBeGreaterThanOrEqual(0);
    expect(shadow.finalScoreV1).toBeLessThanOrEqual(1);
    expect(shadow.relationshipProfileScore).toBeGreaterThanOrEqual(0);
    expect(shadow.relationshipProfileScore).toBeLessThanOrEqual(1);
  });

  it("merges scoreShadowV2 into matchInsights without dropping placeholder keys", () => {
    const components = computeFinalScoreV1(params);
    const base = buildMatchInsightsPlaceholder(components, params.candidateUser);
    const v2Row = {
      scoringVersion: "m6.0-relationship-profile-score-v2-shadow",
      rawCompatibilityScore: 0.5,
      weightedBaseScore: 0.5,
      penaltyTotal: 0,
      cappedRawScore: 0.5,
      displayScore100: 50,
      band: "medium" as const,
      capApplied: null,
      coreConflictCount: 0,
      strongConflictCount: 0,
      redFlagConflictCount: 0,
      validAxisCount: 4,
      skippedAxisCount: 0,
      source: "profile_v2_shadow" as const,
    };
    const merged = { ...base, scoreShadowV2: v2Row };
    expect(merged.explanation?.whyMatch).toContain("预览=");
    expect(Array.isArray(merged.openingTopics)).toBe(true);
    expect(merged.scoreShadowV2?.displayScore100).toBe(50);
  });
});
