import {
  auditOverallExplanationConvergence,
  formatConvergenceReport,
  getCanonicalAnswerCombinationCount,
} from "../src/modules/questionnaire/questionnaire-overall-explanation-convergence-audit";

describe("questionnaire overallExplanation convergence audit", () => {
  it("documents full answer space size (30 canonical × 4 options)", () => {
    const total = getCanonicalAnswerCombinationCount();
    expect(total).toBe(4n ** 30n);
    expect(total).toBeGreaterThan(10n ** 18n);
  });

  it("random sample: no invalid explanations; reports convergence stats", () => {
    const report = auditOverallExplanationConvergence({
      mode: "random",
      randomSamples: 8_000,
      randomSeed: 20260528,
    });

    expect(report.invalidCount).toBe(0);
    expect(report.sampled).toBe(8_000);
    expect(report.uniqueExplanationFingerprints).toBeGreaterThan(0);
    expect(report.uniqueExplanationFingerprints).toBeLessThan(
      report.sampled,
    );
    expect(report.instabilitySamples.length).toBe(0);
    expect(report.nonConvergentFallbackCount).toBeGreaterThanOrEqual(0);
    expect(report.nonConvergentFallbackRatio).toBeLessThanOrEqual(1);

    // eslint-disable-next-line no-console -- audit visibility
    console.log("\n" + formatConvergenceReport(report));
  });

  it("greedy-target corners (5^20 capped): no invalid; bounded unique explanations", () => {
    const report = auditOverallExplanationConvergence({
      mode: "greedy-targets",
      maxSamples: 50_000,
    });

    expect(report.invalidCount).toBe(0);
    expect(report.sampled).toBe(50_000);
    expect(report.cappedAt).toBe(50_000);
    expect(report.instabilitySamples.length).toBe(0);
    expect(report.uniqueExplanationFingerprints).toBeLessThan(
      report.sampled,
    );

    // eslint-disable-next-line no-console -- audit visibility
    console.log("\n" + formatConvergenceReport(report));
  });

  const runExhaustive =
    process.env.QUESTIONNAIRE_OVERALL_EXPLANATION_EXHAUSTIVE === "1";

  (runExhaustive ? it : it.skip)(
    "optional full exhaustive (set QUESTIONNAIRE_OVERALL_EXPLANATION_EXHAUSTIVE=1, very slow)",
    () => {
      const report = auditOverallExplanationConvergence({
        mode: "exhaustive",
        maxSamples: Number.POSITIVE_INFINITY,
      });
      expect(report.invalidCount).toBe(0);
      expect(report.sampled).toBe(Number(getCanonicalAnswerCombinationCount()));
      // eslint-disable-next-line no-console -- audit visibility
      console.log("\n" + formatConvergenceReport(report));
    },
    600_000_000,
  );
});
