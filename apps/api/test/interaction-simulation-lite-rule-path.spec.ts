import type { MatchReviewStaticSummaryPayload } from "../src/modules/match-review-ai/match-review-ai.types";
import { INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION } from "../src/modules/interaction-simulation-lite/interaction-simulation-lite.constants";
import {
  applyCoherencePass,
  computeRawBandsV1,
  detectTensions,
} from "../src/modules/interaction-simulation-lite/interaction-simulation-lite-coherence";
import { buildInteractionSimulationLiteRulePayload } from "../src/modules/interaction-simulation-lite/interaction-simulation-lite-rule";

function staticSummary(
  overrides: Partial<MatchReviewStaticSummaryPayload> = {},
): MatchReviewStaticSummaryPayload {
  return {
    majorFits: ["fit-a", "fit-b"],
    majorRisks: [],
    dimensionHighlights: [],
    labelFitSummary: "",
    confidenceSummary: "测试置信说明",
    ...overrides,
  };
}

const BAND3 = new Set(["high", "medium", "low"]);
const RISK = new Set(["low", "medium", "high"]);
const VERDICT = new Set(["worth_exploring", "cautious", "pause"]);

describe("P6.y interaction simulation lite — rule path guardrails", () => {
  it("exports rule source version v2", () => {
    expect(INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION).toBe(
      "p6.y-interaction-lite-rule-v2",
    );
  });

  it("buildInteractionSimulationLiteRulePayload returns valid axes, verdict, and non-empty copy", () => {
    const { axes, overall } = buildInteractionSimulationLiteRulePayload({
      reviewStaticScore: 62,
      staticSummary: staticSummary(),
    });

    expect(BAND3.has(axes.pickupEase.band)).toBe(true);
    expect(RISK.has(axes.coldFieldRisk.band)).toBe(true);
    expect(RISK.has(axes.misunderstandingRisk.band)).toBe(true);
    expect(BAND3.has(axes.continuationSignal.band)).toBe(true);

    expect(axes.pickupEase.oneLiner.length).toBeGreaterThan(0);
    expect(axes.coldFieldRisk.oneLiner.length).toBeGreaterThan(0);
    expect(axes.misunderstandingRisk.oneLiner.length).toBeGreaterThan(0);
    expect(axes.continuationSignal.oneLiner.length).toBeGreaterThan(0);

    expect(VERDICT.has(overall.verdict)).toBe(true);
    expect(overall.summary.trim().length).toBeGreaterThan(20);
  });

  it("high cold + high mis leads to pause verdict (rule v2)", () => {
    const { overall } = buildInteractionSimulationLiteRulePayload({
      reviewStaticScore: 38,
      staticSummary: staticSummary({
        majorFits: ["x", "y"],
        majorRisks: ["r1", "r2", "r3", "r4"],
      }),
    });
    expect(overall.verdict).toBe("pause");
  });

  it("appends labelFitSummary only as trailer line", () => {
    const { overall } = buildInteractionSimulationLiteRulePayload({
      reviewStaticScore: 62,
      staticSummary: staticSummary({
        labelFitSummary: "双方节奏一快一慢",
      }),
    });
    expect(overall.summary).toContain("画像摘要补充：");
    const parts = overall.summary.split("\n\n");
    const last = parts[parts.length - 1] ?? "";
    expect(last).toContain("画像摘要补充：");
    expect(last).toContain("双方节奏一快一慢");
  });

  it("PICKUP_VS_COLD only when raw pickup and cold are both high", () => {
    const rawBothHigh = computeRawBandsV1(2, 4, 65);
    expect(rawBothHigh.pickup).toBe("high");
    expect(rawBothHigh.cold).toBe("high");
    expect(detectTensions(rawBothHigh)).toContain("PICKUP_VS_COLD");

    const rawMedCold = { ...rawBothHigh, cold: "medium" as const };
    expect(detectTensions(rawMedCold)).not.toContain("PICKUP_VS_COLD");
  });

  it("coherence caps continuation when dual risk raw", () => {
    const raw = computeRawBandsV1(2, 4, 50);
    const { bands } = applyCoherencePass(raw);
    if (raw.cold === "high" && raw.mis === "high") {
      expect(bands.cont).toBe("low");
    }
  });
});
