import { computeReadoutFusion } from "../src/modules/match-readout-fusion/match-readout-fusion-fusion.rule";

describe("computeReadoutFusion", () => {
  it("returns empty tensionZh when three stances align (up)", () => {
    const r = computeReadoutFusion({
      matchResultId: "m1",
      workerFinalScore: 0.7,
      p6xRecommendation: "strong_match",
      p6yVerdict: "worth_exploring",
    });
    expect(r.headlineZh).toContain("总读数：");
    expect(r.bulletsZh.length).toBeGreaterThanOrEqual(2);
    expect(r.tensionZh).toBe("");
    expect(r.debug.ruleTrace).toContain("consensus_up");
  });

  it("tension A when worker up and p6y pause", () => {
    const r = computeReadoutFusion({
      matchResultId: "m2",
      workerFinalScore: 80,
      p6xRecommendation: "match",
      p6yVerdict: "pause",
    });
    expect(r.tensionZh.length).toBeGreaterThan(0);
    expect(r.debug.ruleTrace).toContain("tension_A");
    expect(r.headlineZh).toContain("总读数：");
  });

  it("tension C when worker mid and p6x+p6y down", () => {
    const r = computeReadoutFusion({
      matchResultId: "m3",
      workerFinalScore: 50,
      p6xRecommendation: "not_recommended",
      p6yVerdict: "pause",
    });
    expect(r.tensionZh.length).toBeGreaterThan(0);
    expect(r.debug.ruleTrace).toContain("tension_C");
  });
});
