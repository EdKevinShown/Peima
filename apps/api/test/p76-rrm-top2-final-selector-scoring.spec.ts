import {
  computeAtoBRrmFit,
  computeBtoARrmFit,
  computeMutualRrmFit,
  computeRepairPotentialScore,
  computeRrmRiskFlagCount,
  computeRrmRiskPenalty,
  harmonicMeanRrmFit,
  sortKeysFullyTied,
  sortRrmTop2Candidates,
} from "../src/modules/matching/p76-rrm-top2-final-selector-scoring";

describe("p76 rrm top2 final selector scoring", () => {
  it("AtoB and BtoA both high → mutual high", () => {
    const aToB = computeAtoBRrmFit({ rhythmScore: 0.9 })!;
    const bToA = computeBtoARrmFit({ rhythmScore: 0.85 })!;
    const mutual = computeMutualRrmFit(aToB, bToA);
    expect(mutual).toBeGreaterThan(0.8);
    expect(mutual).toBeLessThanOrEqual(1);
  });

  it("AtoB high BtoA low → harmonic penalizes mutual", () => {
    const mutual = harmonicMeanRrmFit(0.9, 0.2);
    const symmetric = harmonicMeanRrmFit(0.55, 0.55);
    expect(mutual).toBeLessThan(symmetric);
    expect(mutual).toBeGreaterThan(0);
  });

  it("either direction 0 → mutual = 0", () => {
    expect(harmonicMeanRrmFit(0.9, 0)).toBe(0);
    expect(harmonicMeanRrmFit(0, 0.8)).toBe(0);
    expect(computeMutualRrmFit(0, 0.5)).toBe(0);
  });

  it("more risk flags → higher riskFlagCount and penalty", () => {
    const low = computeRrmRiskFlagCount({
      rhythmRiskFlags: ["pace_mismatch"],
    });
    const high = computeRrmRiskFlagCount({
      rhythmRiskFlags: ["pace_mismatch", "boundary_push"],
      pressureRiskFlags: ["viewer_led_pressure"],
      boundaryRiskFlags: ["overstep"],
    });
    expect(high).toBeGreaterThan(low);
    expect(computeRrmRiskPenalty({ rhythmRiskFlags: ["a", "b"] })).toBeGreaterThan(
      computeRrmRiskPenalty({ rhythmRiskFlags: [] }),
    );
  });

  it("sortRrmTop2Candidates: risk flags degrade rank", () => {
    const sorted = sortRrmTop2Candidates([
      {
        candidateUserId: "c-risky",
        AtoBRrmFit: 0.7,
        BtoARrmFit: 0.7,
        mutualRrmFit: 0.7,
        riskFlagCount: 3,
        repairPotentialScore: 0.2,
      },
      {
        candidateUserId: "c-clean",
        AtoBRrmFit: 0.7,
        BtoARrmFit: 0.7,
        mutualRrmFit: 0.7,
        riskFlagCount: 0,
        repairPotentialScore: 0.2,
      },
    ]);
    expect(sorted[0]!.candidateUserId).toBe("c-clean");
  });

  it("sortRrmTop2Candidates: repairPotential tie-break", () => {
    const sorted = sortRrmTop2Candidates([
      {
        candidateUserId: "c-low-repair",
        AtoBRrmFit: 0.7,
        BtoARrmFit: 0.7,
        mutualRrmFit: 0.7,
        riskFlagCount: 0,
        repairPotentialScore: 0.2,
      },
      {
        candidateUserId: "c-high-repair",
        AtoBRrmFit: 0.7,
        BtoARrmFit: 0.7,
        mutualRrmFit: 0.7,
        riskFlagCount: 0,
        repairPotentialScore: 0.8,
      },
    ]);
    expect(sorted[0]!.candidateUserId).toBe("c-high-repair");
  });

  it("sortRrmTop2Candidates: candidateUserId tie-break", () => {
    const sorted = sortRrmTop2Candidates([
      {
        candidateUserId: "z-last",
        AtoBRrmFit: 0.5,
        BtoARrmFit: 0.5,
        mutualRrmFit: 0.5,
        riskFlagCount: 0,
        repairPotentialScore: 0.4,
      },
      {
        candidateUserId: "a-first",
        AtoBRrmFit: 0.5,
        BtoARrmFit: 0.5,
        mutualRrmFit: 0.5,
        riskFlagCount: 0,
        repairPotentialScore: 0.4,
      },
    ]);
    expect(sorted[0]!.candidateUserId).toBe("a-first");
    expect(sortKeysFullyTied(sorted[0]!, sorted[1]!)).toBe(true);
  });

  it("computeRepairPotentialScore from signals vs explicit", () => {
    expect(
      computeRepairPotentialScore({
        repairPotentialSignals: ["repair_a", "repair_b"],
      }),
    ).toBeGreaterThan(
      computeRepairPotentialScore({ repairPotentialSignals: [] }),
    );
    expect(
      computeRepairPotentialScore({
        repairPotentialSignals: [],
        repairPotentialScore: 0.95,
      }),
    ).toBe(0.95);
  });

  it("null rhythm score → directional fit null", () => {
    expect(computeAtoBRrmFit({ rhythmScore: null })).toBeNull();
    expect(computeBtoARrmFit({ rhythmScore: null })).toBeNull();
  });
});
