import {
  resolveRelationshipProfileScoreV2Shadow,
  type ViewerSafeRelationshipProfileScoreV2,
} from "../src/modules/matching/matching-relationship-profile-score-v2";

const KEYS: (keyof ViewerSafeRelationshipProfileScoreV2)[] = [
  "scoringVersion",
  "rawCompatibilityScore",
  "weightedBaseScore",
  "penaltyTotal",
  "cappedRawScore",
  "displayScore100",
  "band",
  "capApplied",
  "coreConflictCount",
  "strongConflictCount",
  "redFlagConflictCount",
  "validAxisCount",
  "skippedAxisCount",
  "source",
];

function validRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
    extraLeakField: "secret",
    ...overrides,
  };
}

describe("resolveRelationshipProfileScoreV2Shadow", () => {
  it("accepts a legal scoreShadowV2 row", () => {
    const mi = { scoreShadowV2: validRow() };
    const r = resolveRelationshipProfileScoreV2Shadow(mi);
    expect(r.source).toBe("match_insights_score_shadow_v2");
    expect(r.scoringVersion).toBe("m6.0-relationship-profile-score-v2-shadow");
    expect(r.displayScore100).toBe(87);
    expect(r.band).toBe("good");
    expect(r.rawCompatibilityScore).toBe(0.88);
    expect(r.capApplied).toBeNull();
    expect(Object.keys(r).sort()).toEqual(KEYS.map(String).sort());
  });

  it("returns missing when scoreShadowV2 absent", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({ scoreShadow: {} });
    expect(r.source).toBe("missing");
    expect(r.band).toBe("missing");
    expect(r.displayScore100).toBeNull();
    expect(r.scoringVersion).toBe("");
  });

  it("returns missing when matchInsights not an object", () => {
    expect(resolveRelationshipProfileScoreV2Shadow(null).source).toBe("missing");
    expect(resolveRelationshipProfileScoreV2Shadow(undefined).source).toBe(
      "missing",
    );
  });

  it("invalid when scoringVersion wrong", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow({ scoringVersion: "other" }),
    });
    expect(r.source).toBe("invalid");
    expect(r.displayScore100).toBeNull();
    expect(r.band).toBe("missing");
  });

  it("invalid when displayScore100 out of range", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow({ displayScore100: 101 }),
    });
    expect(r.source).toBe("invalid");
  });

  it("invalid when displayScore100 is not an integer", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow({ displayScore100: 87.5 }),
    });
    expect(r.source).toBe("invalid");
  });

  it("invalid when band not in five tiers", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow({ band: "excellent" }),
    });
    expect(r.source).toBe("invalid");
  });

  it("invalid when counts negative or non-integer", () => {
    expect(
      resolveRelationshipProfileScoreV2Shadow({
        scoreShadowV2: validRow({ coreConflictCount: -1 }),
      }).source,
    ).toBe("invalid");
    expect(
      resolveRelationshipProfileScoreV2Shadow({
        scoreShadowV2: validRow({ validAxisCount: 3.5 }),
      }).source,
    ).toBe("invalid");
  });

  it("accepts insufficient_profile worker row source when other fields valid", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow({
        source: "insufficient_profile",
        validAxisCount: 7,
        displayScore100: 62,
        rawCompatibilityScore: 0.5,
        weightedBaseScore: 0.5,
        cappedRawScore: 0.5,
      }),
    });
    expect(r.source).toBe("match_insights_score_shadow_v2");
  });

  it("invalid when worker row source is unknown", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow({ source: "hacked" }),
    });
    expect(r.source).toBe("invalid");
  });

  it("does not leak extra fields from persisted JSON", () => {
    const r = resolveRelationshipProfileScoreV2Shadow({
      scoreShadowV2: validRow(),
    });
    expect((r as Record<string, unknown>).extraLeakField).toBeUndefined();
  });
});
