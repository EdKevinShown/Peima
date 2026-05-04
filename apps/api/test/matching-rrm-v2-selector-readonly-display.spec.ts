import { tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights } from "../src/modules/matching/matching-rrm-v2-selector-readonly-display";

/** Sync with `packages/shared/types/match-p1.ts` */
const MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION =
  "m6.0-rrm-v2-top2-selector-shadow-v1" as const;

function v2() {
  return {
    scoringVersion: "m6.0-relationship-profile-score-v2-shadow" as const,
    rawCompatibilityScore: 1,
    weightedBaseScore: 1,
    penaltyTotal: 0,
    cappedRawScore: 1,
    displayScore100: 72,
    band: "medium" as const,
    capApplied: null,
    coreConflictCount: 0,
    strongConflictCount: 0,
    redFlagConflictCount: 0,
    validAxisCount: 4,
    skippedAxisCount: 0,
    source: "profile_v2_shadow" as const,
  };
}

function selectorBase(over: Record<string, unknown> = {}) {
  return {
    version: MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION,
    eligible: true,
    reason: "ok",
    selectedTop2: [{ candidateUserId: "u-a", displayScore100: 80, band: "good" }],
    top1CandidateUserId: "u-a",
    top2CandidateUserId: null,
    top2Gap: null,
    contextFlags: {
      top2GapLarge: false,
      hasLowBand: false,
      hasStrongConflictBand: false,
      anyBelowSuggestedFloor: false,
    },
    thresholds: { suggestedFloorDisplayScore100: 50, largeGapThreshold: 20 },
    ...over,
  };
}

describe("tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights", () => {
  it("returns display id when v2 + selector valid", () => {
    const r = tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
      scoreShadowV2: v2(),
      rrmV2Top2Selector: selectorBase(),
    });
    expect(r).toEqual({ displayUserId: "u-a" });
  });

  it("returns null when scoreShadowV2 missing (v1 only does not count)", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadow: { scoringVersion: "m6.0-profile-score-shadow-v1", finalScoreV1: 1, relationshipProfileScore: 1 },
        rrmV2Top2Selector: selectorBase(),
      }),
    ).toBeNull();
  });

  it("returns null when eligible false", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({ eligible: false }),
      }),
    ).toBeNull();
  });

  it("returns null when reason !== ok", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({ reason: "invalid_score_shadow_v2" }),
      }),
    ).toBeNull();
  });

  it("returns null when selectedTop2 empty", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({ selectedTop2: [] }),
      }),
    ).toBeNull();
  });

  it("returns null when >2 selectedTop2", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({
          selectedTop2: [
            { candidateUserId: "a", displayScore100: 80, band: "good" },
            { candidateUserId: "b", displayScore100: 70, band: "medium" },
            { candidateUserId: "c", displayScore100: 60, band: "medium" },
          ],
        }),
      }),
    ).toBeNull();
  });

  it("returns null when contextFlags risk true", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({
          contextFlags: {
            top2GapLarge: true,
            hasLowBand: false,
            hasStrongConflictBand: false,
            anyBelowSuggestedFloor: false,
          },
        }),
      }),
    ).toBeNull();
  });

  it("returns null when top1 mismatch", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({
          selectedTop2: [{ candidateUserId: "u-a", displayScore100: 80, band: "good" }],
          top1CandidateUserId: "other",
        }),
      }),
    ).toBeNull();
  });

  it("returns null when duplicate ranks", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({
          selectedTop2: [
            { candidateUserId: "u-a", displayScore100: 80, band: "good", rank: 1 },
            { candidateUserId: "u-b", displayScore100: 70, band: "medium", rank: 1 },
          ],
          top1CandidateUserId: "u-a",
          top2CandidateUserId: "u-b",
        }),
      }),
    ).toBeNull();
  });

  it("accepts two items with distinct ranks", () => {
    const r = tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
      scoreShadowV2: v2(),
      rrmV2Top2Selector: selectorBase({
        selectedTop2: [
          { candidateUserId: "u-a", displayScore100: 80, band: "good", rank: 1 },
          { candidateUserId: "u-b", displayScore100: 70, band: "medium", rank: 2 },
        ],
        top1CandidateUserId: "u-a",
        top2CandidateUserId: "u-b",
      }),
    });
    expect(r).toEqual({ displayUserId: "u-a" });
  });

  it("returns null when schemaVersion present and not 1", () => {
    expect(
      tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights({
        scoreShadowV2: v2(),
        rrmV2Top2Selector: selectorBase({ schemaVersion: 2 }),
      }),
    ).toBeNull();
  });
});
