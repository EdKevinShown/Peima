import {
  buildRelationshipProfileScoreShadow,
  resolveRelationshipProfileScoreShadow,
} from "../src/modules/matching/matching-relationship-profile-score";
import type { ViewerSafeScoreBreakdown } from "../src/modules/matching/matching-score-breakdown";

function validScoreShadowV2Row(overrides: Record<string, unknown> = {}) {
  return {
    scoringVersion: "m6.0-relationship-profile-score-v2-shadow",
    rawCompatibilityScore: 0.88,
    weightedBaseScore: 0.88,
    penaltyTotal: 0,
    cappedRawScore: 0.88,
    displayScore100: 87,
    band: "good",
    capApplied: null,
    coreConflictCount: 0,
    strongConflictCount: 0,
    redFlagConflictCount: 0,
    validAxisCount: 18,
    skippedAxisCount: 2,
    source: "profile_v2_shadow",
    ...overrides,
  };
}

describe("buildRelationshipProfileScoreShadow", () => {
  it("maps finite profileScore from reason_summary_v1 breakdown", () => {
    const breakdown: ViewerSafeScoreBreakdown = {
      previewPoolScore: 0.8,
      preferenceScore: 1,
      styleScore: 1,
      profileScore: 0.821217,
      source: "reason_summary_v1",
    };
    expect(buildRelationshipProfileScoreShadow(breakdown)).toEqual({
      score: 0.821217,
      source: "score_breakdown_profile_score",
    });
  });

  it("accepts profileScore 0", () => {
    const breakdown: ViewerSafeScoreBreakdown = {
      previewPoolScore: 0.5,
      preferenceScore: 0.5,
      styleScore: 0.5,
      profileScore: 0,
      source: "reason_summary_v1",
    };
    expect(buildRelationshipProfileScoreShadow(breakdown)).toEqual({
      score: 0,
      source: "score_breakdown_profile_score",
    });
  });

  it("returns missing when profileScore is null (parse_failed)", () => {
    const breakdown: ViewerSafeScoreBreakdown = {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    };
    expect(buildRelationshipProfileScoreShadow(breakdown)).toEqual({
      score: null,
      source: "missing",
    });
  });

  it("returns missing when breakdown source is missing", () => {
    const breakdown: ViewerSafeScoreBreakdown = {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "missing",
    };
    expect(buildRelationshipProfileScoreShadow(breakdown)).toEqual({
      score: null,
      source: "missing",
    });
  });

  it("returns missing for non-finite profileScore (defensive)", () => {
    const breakdown = {
      previewPoolScore: 0.8,
      preferenceScore: 1,
      styleScore: 1,
      profileScore: Number.NaN,
      source: "reason_summary_v1" as const,
    } as ViewerSafeScoreBreakdown;
    expect(buildRelationshipProfileScoreShadow(breakdown)).toEqual({
      score: null,
      source: "missing",
    });
  });
});

describe("resolveRelationshipProfileScoreShadow", () => {
  const breakdownOk: ViewerSafeScoreBreakdown = {
    previewPoolScore: 0.8,
    preferenceScore: 1,
    styleScore: 1,
    profileScore: 0.77,
    source: "reason_summary_v1",
  };

  it("prefers matchInsights.scoreShadowV2 when valid", () => {
    const mi = { scoreShadowV2: validScoreShadowV2Row({ displayScore100: 88 }) };
    expect(resolveRelationshipProfileScoreShadow(mi, breakdownOk)).toEqual({
      score: 0.88,
      source: "match_insights_score_shadow_v2",
    });
  });

  it("falls back to scoreBreakdown when scoreShadowV2 missing", () => {
    expect(resolveRelationshipProfileScoreShadow({}, breakdownOk)).toEqual({
      score: 0.77,
      source: "score_breakdown_profile_score",
    });
  });

  it("falls back when scoreShadowV2 invalid (legacy v1 blob ignored)", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: 0.9,
        relationshipProfileScore: 0.88,
        scoringVersion: "m6.0-profile-score-shadow-v1",
      },
      scoreShadowV2: { scoringVersion: "wrong" },
    };
    expect(resolveRelationshipProfileScoreShadow(mi, breakdownOk)).toEqual({
      score: 0.77,
      source: "score_breakdown_profile_score",
    });
  });
});
