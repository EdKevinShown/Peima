/**
 * M6.0-R2 — selectV2Top2Candidates pure helper tests.
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

describe("selectV2Top2Candidates", () => {
  it("1. two legal high scores small gap → eligible ok + Top2", () => {
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 82, band: "good" }) },
        { candidateUserId: "a", scoreShadowV2: shadowV2({ displayScore100: 88, band: "high" }) },
      ],
      { minDisplayScore100: 65, maxTop2Gap: 12 },
    );
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.top1CandidateUserId).toBe("a");
    expect(r.top2CandidateUserId).toBe("b");
    expect(r.top2Gap).toBe(6);
    expect(r.selectedTop2.map((x) => x.candidateUserId)).toEqual(["a", "b"]);
    expect(r.selectedTop2.map((x) => x.displayScore100)).toEqual([88, 82]);
  });

  it("2. fewer than 2 valid → not_enough_valid_v2_candidates", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "only", scoreShadowV2: shadowV2({ displayScore100: 90 }) },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
    expect(r.selectedTop2).toEqual([]);
    expect(r.top1CandidateUserId).toBeNull();
  });

  it("3. multiple rows but only one parses → not_enough", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "ok", scoreShadowV2: shadowV2({ displayScore100: 77 }) },
      { candidateUserId: "bad", scoreShadowV2: { scoringVersion: "wrong" } as never },
      { candidateUserId: "missing", scoreShadowV2: null },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
  });

  it("4. second-ranked below minDisplayScore100 → top2_below_min_score", () => {
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "hi", scoreShadowV2: shadowV2({ displayScore100: 90, band: "high" }) },
        { candidateUserId: "lo", scoreShadowV2: shadowV2({ displayScore100: 64, band: "medium" }) },
      ],
      { minDisplayScore100: 65, maxTop2Gap: 12 },
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("top2_below_min_score");
    expect(r.top1CandidateUserId).toBe("hi");
    expect(r.top2CandidateUserId).toBe("lo");
    expect(r.top2Gap).toBe(26);
  });

  it("5. Top1 − Top2 > maxTop2Gap → top2_gap_too_large", () => {
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "t1", scoreShadowV2: shadowV2({ displayScore100: 90, band: "high" }) },
        { candidateUserId: "t2", scoreShadowV2: shadowV2({ displayScore100: 75, band: "good" }) },
      ],
      { minDisplayScore100: 65, maxTop2Gap: 12 },
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("top2_gap_too_large");
    expect(r.top2Gap).toBe(15);
  });

  it("6. band low / strong_conflict excluded by default allowBands", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "l", scoreShadowV2: shadowV2({ displayScore100: 90, band: "low" }) },
      { candidateUserId: "s", scoreShadowV2: shadowV2({ displayScore100: 88, band: "strong_conflict" }) },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
  });

  it("7. missing / invalid shadow → not_enough or invalid_score_shadow_v2", () => {
    const onlyMissing = selectV2Top2Candidates([
      { candidateUserId: "a", scoreShadowV2: null },
      { candidateUserId: "b" },
    ]);
    expect(onlyMissing.reason).toBe("not_enough_valid_v2_candidates");

    const allInvalidObjects = selectV2Top2Candidates([
      { candidateUserId: "x", scoreShadowV2: { scoringVersion: "x" } as never },
      { candidateUserId: "y", scoreShadowV2: { bad: true } as never },
    ]);
    expect(allInvalidObjects.reason).toBe("invalid_score_shadow_v2");
  });

  it("8. displayScore100 out of 0–100 → rejected", () => {
    const r = selectV2Top2Candidates([
      { candidateUserId: "a", scoreShadowV2: shadowV2({ displayScore100: 101 }) },
      { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 80 }) },
    ]);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
  });

  it("9. sort stable: 90, 82, 76 → Top2 are 90 and 82", () => {
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "m", scoreShadowV2: shadowV2({ displayScore100: 76, band: "medium" }) },
        { candidateUserId: "h", scoreShadowV2: shadowV2({ displayScore100: 90, band: "high" }) },
        { candidateUserId: "g", scoreShadowV2: shadowV2({ displayScore100: 82, band: "good" }) },
      ],
      { minDisplayScore100: 65, maxTop2Gap: 20 },
    );
    expect(r.eligible).toBe(true);
    expect(r.selectedTop2[0].displayScore100).toBe(90);
    expect(r.selectedTop2[1].displayScore100).toBe(82);
  });

  it("10. output rows only expose id / displayScore100 / band (no raw meta passthrough)", () => {
    const extra = shadowV2({ displayScore100: 85, coreConflictCount: 99 });
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "a", scoreShadowV2: extra },
        { candidateUserId: "b", scoreShadowV2: shadowV2({ displayScore100: 84 }) },
      ],
      { maxTop2Gap: 12 },
    );
    expect(r.eligible).toBe(true);
    for (const row of r.selectedTop2) {
      expect(Object.keys(row).sort()).toEqual(["band", "candidateUserId", "displayScore100"].sort());
      expect((row as Record<string, unknown>).coreConflictCount).toBeUndefined();
    }
  });

  it("insufficient_profile source is accepted when otherwise valid", () => {
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

  it("tie-break by candidateUserId when scores equal", () => {
    const r = selectV2Top2Candidates(
      [
        { candidateUserId: "z", scoreShadowV2: shadowV2({ displayScore100: 80 }) },
        { candidateUserId: "m", scoreShadowV2: shadowV2({ displayScore100: 80 }) },
      ],
      { maxTop2Gap: 12 },
    );
    expect(r.eligible).toBe(true);
    expect(r.selectedTop2[0].candidateUserId).toBe("m");
    expect(r.selectedTop2[1].candidateUserId).toBe("z");
  });
});
