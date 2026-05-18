import {
  computeAtoB20DFit,
  computeBtoA20DFit,
  computeMutual20DFit,
  harmonicMean20DFit,
  clampTwentyDScore,
  sortTwentyDRankedCandidates,
  TWENTY_D_WEIGHT_PREFERENCE,
  TWENTY_D_WEIGHT_PROFILE,
} from "../src/modules/matching/p76-20d-bidirectional-ranking-scoring";

describe("p76 20d bidirectional ranking scoring", () => {
  const high = { profile: 0.9, preference: 0.85 };
  const low = { profile: 0.1, preference: 0.1 };

  function directional(profile: number, preference: number) {
    return (
      TWENTY_D_WEIGHT_PROFILE * profile +
      TWENTY_D_WEIGHT_PREFERENCE * preference
    );
  }

  it("AtoB and BtoA both high", () => {
    const aToB = computeAtoB20DFit({
      profileScoreAtoB: high.profile,
      preferenceScoreAtoB: high.preference,
    });
    const bToA = computeBtoA20DFit({
      profileScoreBtoA: high.profile,
      preferenceScoreBtoA: high.preference,
    });
    expect(aToB).toBeCloseTo(directional(high.profile, high.preference), 5);
    expect(bToA).toBeCloseTo(directional(high.profile, high.preference), 5);
    expect(computeMutual20DFit(aToB!, bToA!)).toBeGreaterThan(0.7);
  });

  it("AtoB high, BtoA low", () => {
    const aToB = computeAtoB20DFit({
      profileScoreAtoB: high.profile,
      preferenceScoreAtoB: high.preference,
    })!;
    const bToA = computeBtoA20DFit({
      profileScoreBtoA: low.profile,
      preferenceScoreBtoA: low.preference,
    })!;
    const harmonic = computeMutual20DFit(aToB, bToA);
    const arithmetic = 0.5 * (aToB + bToA);
    expect(harmonic).toBeLessThan(arithmetic);
    expect(harmonic).toBeCloseTo(harmonicMean20DFit(aToB, bToA), 5);
  });

  it("AtoB low, BtoA high", () => {
    const aToB = computeAtoB20DFit({
      profileScoreAtoB: low.profile,
      preferenceScoreAtoB: low.preference,
    })!;
    const bToA = computeBtoA20DFit({
      profileScoreBtoA: high.profile,
      preferenceScoreBtoA: high.preference,
    })!;
    expect(computeMutual20DFit(aToB, bToA)).toBeLessThan(bToA);
  });

  it("harmonicMean short-board penalty", () => {
    expect(harmonicMean20DFit(0.8, 0.2)).toBeCloseTo((2 * 0.8 * 0.2) / 1, 5);
    expect(harmonicMean20DFit(0, 0.5)).toBe(0);
    expect(harmonicMean20DFit(0.5, 0)).toBe(0);
  });

  it("zero scores", () => {
    const aToB = computeAtoB20DFit({
      profileScoreAtoB: 0,
      preferenceScoreAtoB: 0,
    })!;
    const bToA = computeBtoA20DFit({
      profileScoreBtoA: 0,
      preferenceScoreBtoA: 0,
    })!;
    expect(computeMutual20DFit(aToB, bToA)).toBe(0);
  });

  it("clamp to 0-1", () => {
    expect(clampTwentyDScore(1.5)).toBe(1);
    expect(clampTwentyDScore(-0.2)).toBe(0);
    expect(clampTwentyDScore(Number.NaN)).toBe(0);
  });

  it("missing profile returns null", () => {
    expect(
      computeAtoB20DFit({
        profileScoreAtoB: null,
        preferenceScoreAtoB: 0.5,
      }),
    ).toBeNull();
  });

  it("sorting mutual desc", () => {
    const sorted = sortTwentyDRankedCandidates([
      {
        candidateUserId: "low",
        AtoB20DFit: 0.5,
        BtoA20DFit: 0.5,
        mutual20DFit: 0.5,
      },
      {
        candidateUserId: "high",
        AtoB20DFit: 0.9,
        BtoA20DFit: 0.9,
        mutual20DFit: 0.9,
      },
    ]);
    expect(sorted[0]!.candidateUserId).toBe("high");
  });

  it("sorting tie by AtoB desc", () => {
    const sorted = sortTwentyDRankedCandidates([
      {
        candidateUserId: "b",
        AtoB20DFit: 0.5,
        BtoA20DFit: 0.8,
        mutual20DFit: 0.6,
      },
      {
        candidateUserId: "a",
        AtoB20DFit: 0.7,
        BtoA20DFit: 0.4,
        mutual20DFit: 0.6,
      },
    ]);
    expect(sorted.map((r) => r.candidateUserId)).toEqual(["a", "b"]);
  });

  it("sorting tie by BtoA desc", () => {
    const sorted = sortTwentyDRankedCandidates([
      {
        candidateUserId: "b",
        AtoB20DFit: 0.6,
        BtoA20DFit: 0.5,
        mutual20DFit: 0.55,
      },
      {
        candidateUserId: "a",
        AtoB20DFit: 0.6,
        BtoA20DFit: 0.9,
        mutual20DFit: 0.55,
      },
    ]);
    expect(sorted[0]!.candidateUserId).toBe("a");
  });

  it("sorting tie by candidateUserId asc", () => {
    const sorted = sortTwentyDRankedCandidates([
      {
        candidateUserId: "z-id",
        AtoB20DFit: 0.6,
        BtoA20DFit: 0.6,
        mutual20DFit: 0.6,
      },
      {
        candidateUserId: "a-id",
        AtoB20DFit: 0.6,
        BtoA20DFit: 0.6,
        mutual20DFit: 0.6,
      },
    ]);
    expect(sorted.map((r) => r.candidateUserId)).toEqual(["a-id", "z-id"]);
  });
});
