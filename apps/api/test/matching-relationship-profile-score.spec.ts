import {
  buildRelationshipProfileScoreShadow,
  resolveRelationshipProfileScoreShadow,
  tryReadRelationshipProfileScoreFromScoreShadow,
} from "../src/modules/matching/matching-relationship-profile-score";
import type { ViewerSafeScoreBreakdown } from "../src/modules/matching/matching-score-breakdown";

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

describe("tryReadRelationshipProfileScoreFromScoreShadow", () => {
  it("reads valid scoreShadow", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: 0.89,
        relationshipProfileScore: 0.821217,
        scoringVersion: "m6.0-profile-score-shadow-v1",
      },
    };
    expect(tryReadRelationshipProfileScoreFromScoreShadow(mi)).toBe(0.821217);
  });

  it("rejects wrong scoringVersion", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: 0.89,
        relationshipProfileScore: 0.82,
        scoringVersion: "other",
      },
    };
    expect(tryReadRelationshipProfileScoreFromScoreShadow(mi)).toBeNull();
  });

  it("rejects out-of-range relationshipProfileScore", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: 0.89,
        relationshipProfileScore: 1.2,
        scoringVersion: "m6.0-profile-score-shadow-v1",
      },
    };
    expect(tryReadRelationshipProfileScoreFromScoreShadow(mi)).toBeNull();
  });

  it("rejects invalid finalScoreV1", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: NaN,
        relationshipProfileScore: 0.8,
        scoringVersion: "m6.0-profile-score-shadow-v1",
      },
    };
    expect(tryReadRelationshipProfileScoreFromScoreShadow(mi)).toBeNull();
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

  it("prefers matchInsights.scoreShadow when valid", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: 0.9,
        relationshipProfileScore: 0.88,
        scoringVersion: "m6.0-profile-score-shadow-v1",
      },
    };
    expect(resolveRelationshipProfileScoreShadow(mi, breakdownOk)).toEqual({
      score: 0.88,
      source: "match_insights_score_shadow",
    });
  });

  it("falls back to scoreBreakdown when scoreShadow missing", () => {
    expect(resolveRelationshipProfileScoreShadow({}, breakdownOk)).toEqual({
      score: 0.77,
      source: "score_breakdown_profile_score",
    });
  });

  it("falls back when scoreShadow invalid", () => {
    const mi = {
      scoreShadow: {
        finalScoreV1: 0.9,
        relationshipProfileScore: 2,
        scoringVersion: "m6.0-profile-score-shadow-v1",
      },
    };
    expect(resolveRelationshipProfileScoreShadow(mi, breakdownOk)).toEqual({
      score: 0.77,
      source: "score_breakdown_profile_score",
    });
  });
});
