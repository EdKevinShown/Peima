import { buildRrmEvalAggregate } from "../../src/modules/rrm-eval";
import type { RrmEvalSampleRecord } from "../../src/modules/rrm-eval";

function sample(partial: Partial<RrmEvalSampleRecord>): RrmEvalSampleRecord {
  return {
    hasConversation: false,
    hasRrmSimSummary: false,
    rrmSupported: false,
    cautionBucket: false,
    negativeOutcome: false,
    positiveOutcome: false,
    simulatedRhythmScore: null,
    observedRhythmProxy: null,
    predictedColdRisk: false,
    actualColdDropoff: false,
    hasConversationFeedback: false,
    assistantHelpful: false,
    ...partial,
  };
}

describe("rrm-eval aggregate (M5.1-r11)", () => {
  it("computes rrmSupportedSuccessRate and cautionNegativeRate", () => {
    const out = buildRrmEvalAggregate({
      samples: [
        sample({ rrmSupported: true, positiveOutcome: true }),
        sample({ rrmSupported: true, negativeOutcome: true }),
        sample({ cautionBucket: true, negativeOutcome: true }),
        sample({ cautionBucket: true, positiveOutcome: true }),
      ],
      limit: 10,
      sinceDays: 30,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(out.sourceVersion).toBe("rrm-eval-v1");
    expect(out.layer).toBe("consumer");
    expect(out.metrics.rrmSupportedSuccessRate).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(out.metrics.cautionNegativeRate).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(out.appliedToMatchResult).toBe(false);
  });

  it("computes observedVsSimDelta mean and coldRiskHitRate", () => {
    const out = buildRrmEvalAggregate({
      samples: [
        sample({
          simulatedRhythmScore: 60,
          observedRhythmProxy: 50,
          predictedColdRisk: true,
          actualColdDropoff: true,
        }),
        sample({
          simulatedRhythmScore: 40,
          observedRhythmProxy: 55,
          predictedColdRisk: true,
          actualColdDropoff: false,
        }),
      ],
      limit: 2,
      sinceDays: 7,
    });

    expect(out.metrics.observedVsSimDelta.sampleCount).toBe(2);
    expect(out.metrics.observedVsSimDelta.meanDelta).toBeCloseTo(2.5);
    expect(out.metrics.coldRiskHitRate.rate).toBe(0.5);
  });

  it("returns null rates when denominators are zero", () => {
    const out = buildRrmEvalAggregate({
      samples: [sample({})],
      limit: 1,
      sinceDays: 30,
    });
    expect(out.metrics.rrmSupportedSuccessRate.rate).toBeNull();
    expect(out.metrics.cautionNegativeRate.rate).toBeNull();
    expect(out.metrics.coldRiskHitRate.rate).toBeNull();
  });
});
