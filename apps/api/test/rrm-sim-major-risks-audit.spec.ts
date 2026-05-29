import {
  analyzeMajorRiskTopics,
  classifyMajorRiskLineToTopic,
  countStaticRiskKeywordMatches,
  relationshipGoalHintRiskHit,
} from "../src/modules/ai-simulation-v1/rrm-sim-major-risks-audit";

describe("rrm-sim-major-risks-audit (M1.3-M6)", () => {
  it("classifies Chinese dimension blurbs into coarse topic buckets", () => {
    expect(classifyMajorRiskLineToTopic("双方在「冲突处理」上差异较明显")).toBe("conflict_style");
    expect(classifyMajorRiskLineToTopic("双方在「生活节奏」上主导倾向不同")).toBe("pace_mismatch");
    expect(classifyMajorRiskLineToTopic("双方在「控制需求」上标量差距大")).toBe("control_need");
  });

  it("analyzeMajorRiskTopics counts duplicate coarse topics", () => {
    const lines = [
      "冲突A",
      "冲突B",
      "节奏C",
      "未知行不含关键词",
      "冲突D",
    ];
    const a = analyzeMajorRiskTopics(lines);
    expect(a.majorRisksCount).toBe(5);
    expect(a.uniqueRiskTopicCount).toBeLessThanOrEqual(4);
    expect(a.duplicateTopicCount).toBeGreaterThanOrEqual(1);
    expect(a.duplicateRatio).toBeGreaterThan(0);
  });

  it("relationshipGoalHintRiskHit matches evaluator-style regex", () => {
    expect(relationshipGoalHintRiskHit("婚姻期待标量差异偏大，相处时需对齐长期预期。")).toBe(true);
    expect(relationshipGoalHintRiskHit("接近或中等差异。")).toBe(false);
  });

  it("countStaticRiskKeywordMatches counts regex hits in blob", () => {
    expect(countStaticRiskKeywordMatches(["婚姻与节奏冲突", "长期价值观"])).toBeGreaterThan(0);
  });
});
