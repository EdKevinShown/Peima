/**
 * M6.0-R2B — selectV2Top2Candidates pure helper tests (always-on RRM context).
 * @see docs/M6/M6.0-r2-v2-top2-selector-helper.md
 */

import { RELATIONSHIP_PROFILE_SCORE_V2_VERSION } from "../src/jobs/relationship-profile-score-v2";
import {
  selectV2Top2Candidates,
  type RrmV2Top2CandidateInput,
} from "../src/jobs/rrm-v2-top2-selector";

function shadowV2(partial: Record<string, unknown> = {}): NonNullable<RrmV2Top2CandidateInput["scoreShadowV2"]> {
  return {
    scoringVersion: RELATIONSHIP_PROFILE_SCORE_V2_VERSION,
    source: "profile_v2_shadow",
    displayScore100: 80,
    band: "good",
    rawCompatibilityScore: 0.8,
    weightedBaseScore: 0.85,
    penaltyTotal: 0,
    cappedRawScore: 0.85,
    capApplied: null,
    coreConflictCount: 0,
    strongConflictCount: 0,
    redFlagConflictCount: 0,
    validAxisCount: 20,
    skippedAxisCount: 0,
    ...partial,
  } as NonNullable<RrmV2Top2CandidateInput["scoreShadowV2"]>;
}

describe("selectV2Top2Candidates (R2B always-on RRM)", () => {
  it("1. two legal high scores → eligible true, reason ok", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 82, band: "good" }) },
      { candidateUserId: "a", scoreShadowV2: shadowV2({ displayScore100: 88, band: "high" }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.top1CandidateUserId).toBe("a");
    expect(r.top2CandidateUserId).toBe("b");
    expect(r.top2Gap).toBe(6);
    expect(r.selectedTop2.map((x) => x.candidateUserId)).toEqual(["a", "b"]);
    expect(r.thresholds.suggestedFloorDisplayScore100).toBe(65);
    expect(r.thresholds.largeGapThreshold).toBe(12);
    expect(r.contextFlags.top2GapLarge).toBe(false);
    expect(r.contextFlags.anyBelowSuggestedFloor).toBe(false);
  });

  it("2. low band still enters Top2; hasLowBand true", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "hi", scoreShadowV2: shadowV2({ displayScore100: 70, band: "high" }) },
      { candidateUserId: "lo", scoreShadowV2: shadowV2({ displayScore100: 68, band: "low" }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.selectedTop2.map((x) => x.band)).toEqual(["high", "low"]);
    expect(r.contextFlags.hasLowBand).toBe(true);
    expect(r.contextFlags.hasStrongConflictBand).toBe(false);
  });

  it("3. strong_conflict still enters Top2; hasStrongConflictBand true", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "a", scoreShadowV2: shadowV2({ displayScore100: 72, band: "good" }) },
      { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 71, band: "strong_conflict" }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.contextFlags.hasStrongConflictBand).toBe(true);
    expect(r.contextFlags.hasLowBand).toBe(false);
  });

  it("4. Top1 − Top2 > 12 → eligible true, top2GapLarge true, reason ok", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "t1", scoreShadowV2: shadowV2({ displayScore100: 90, band: "high" }) },
      { candidateUserId: "t2", scoreShadowV2: shadowV2({ displayScore100: 75, band: "good" }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.top2Gap).toBe(15);
    expect(r.contextFlags.top2GapLarge).toBe(true);
  });

  it("5. Top2 below suggested floor 65 → eligible true, anyBelowSuggestedFloor true", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "hi", scoreShadowV2: shadowV2({ displayScore100: 90, band: "high" }) },
      { candidateUserId: "lo", scoreShadowV2: shadowV2({ displayScore100: 64, band: "medium" }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.contextFlags.anyBelowSuggestedFloor).toBe(true);
  });

  it("6. missing / invalid scoreShadowV2 still filtered from pool", () => {
    const onlyMissing = selectV2Top2Candidates([
      { candidateUserId: "a", scoreShadowV2: null },
      { candidateUserId: "b" },
    ]);
    expect(onlyMissing.eligible).toBe(false);
    expect(onlyMissing.reason).toBe("not_enough_valid_v2_candidates");

    const mixed = selectV2Top2Candidates([
      { candidateUserId: "ok", scoreShadowV2: shadowV2({ displayScore100: 77 }) },
      { candidateUserId: "bad", scoreShadowV2: { scoringVersion: "wrong" } as never },
    ]);
    expect(mixed.eligible).toBe(false);
    expect(mixed.reason).toBe("not_enough_valid_v2_candidates");

    const allInvalidObjects = selectV2Top2Candidates([
      { candidateUserId: "x", scoreShadowV2: { scoringVersion: "x" } as never },
      { candidateUserId: "y", scoreShadowV2: { bad: true } as never },
    ]);
    expect(allInvalidObjects.reason).toBe("invalid_score_shadow_v2");
  });

  it("7. fewer than 2 valid after parse → not_enough_valid_v2_candidates", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "only", scoreShadowV2: shadowV2({ displayScore100: 90 }) },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
    expect(r.selectedTop2).toEqual([]);
  });

  it("8. sort stable: 90, 82, 76 → Top2 are 90 and 82", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "m", scoreShadowV2: shadowV2({ displayScore100: 76, band: "medium" }) },
      { candidateUserId: "h", scoreShadowV2: shadowV2({ displayScore100: 90, band: "high" }) },
      { candidateUserId: "g", scoreShadowV2: shadowV2({ displayScore100: 82, band: "good" }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.selectedTop2[0].displayScore100).toBe(90);
    expect(r.selectedTop2[1].displayScore100).toBe(82);
  });

  it("9. output rows only expose id / displayScore100 / band (no questionnaire / token / matchInsights)", () => {
    const extra = shadowV2({ displayScore100: 85, coreConflictCount: 99 });
    const r = selectV2Top2Candidates([
      { candidateUserId: "a", scoreShadowV2: extra },
      { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 84 }) },
    ]);
    expect(r.eligible).toBe(true);
    for (const row of r.selectedTop2) {
      expect(Object.keys(row).sort()).toEqual(["band", "candidateUserId", "displayScore100"].sort());
      expect((row as Record<string, unknown>).coreConflictCount).toBeUndefined();
    }
    expect((r as Record<string, unknown>).matchInsights).toBeUndefined();
  });

  it("custom thresholds affect flags only (still eligible)", () => {
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "a", scoreShadowV2: shadowV2({ displayScore100: 70 }) },
        { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 68 }) },
      ],
      { suggestedFloorDisplayScore100: 60, largeGapThreshold: 1 },
    );
    expect(r.eligible).toBe(true);
    expect(r.thresholds.suggestedFloorDisplayScore100).toBe(60);
    expect(r.thresholds.largeGapThreshold).toBe(1);
    expect(r.contextFlags.anyBelowSuggestedFloor).toBe(false);
    expect(r.contextFlags.top2GapLarge).toBe(true);
  });

  it("insufficient_profile source accepted when otherwise valid", () => {
    const r = selectV2Top2Candidates([
      {
        candidateUserId: "a",
        scoreShadowV2: shadowV2({ displayScore100: 70, band: "medium", source: "insufficient_profile" }),
      },
      {
        candidateUserId: "b",
        scoreShadowV2: shadowV2({ displayScore100: 68, band: "medium", source: "insufficient_profile" }),
      },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("displayScore100 out of 0–100 rejected; OOB row not counted valid", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "a", scoreShadowV2: shadowV2({ displayScore100: 101 }) },
      { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 80 }) },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
  });

  it("tie-break by candidateUserId when scores equal", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "z", scoreShadowV2: shadowV2({ displayScore100: 80 }) },
      { candidateUserId: "m", scoreShadowV2: shadowV2({ displayScore100: 80 }) },
    ]);
    expect(r.eligible).toBe(true);
    expect(r.selectedTop2[0].candidateUserId).toBe("m");
    expect(r.selectedTop2[1].candidateUserId).toBe("z");
  });
});
