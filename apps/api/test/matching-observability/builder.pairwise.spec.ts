import { buildMatchingObservabilitySummary } from "@peima/database";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("buildMatchingObservabilitySummary · pairwise", () => {
  it("aggregates status, sourceVersion, fallbackUsed, and failureDetail codes", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 500,
      sinceDays: 30,
      m42SanitizedRunRecordExists: false,
      generatedAt: new Date("2026-05-23T10:00:00.000Z"),
    });

    expect(report.pairwise.totalInWindow).toBe(4);
    expect(report.pairwise.statusDistribution).toEqual({
      succeeded: 2,
      failed: 1,
      queued: 1,
    });
    expect(report.pairwise.sourceVersionDistribution).toEqual({ "pairwise-v1": 4 });
    expect(report.pairwise.fallbackUsed).toMatchObject({
      trueCount: 1,
      falseCount: 2,
      nullCount: 1,
      rateDenominatorAll: 4,
      rateTrueOverAll: 0.25,
    });
    expect(report.pairwise.failureDetailCodeDistribution).toEqual({
      schema_validation: 1,
      "(null)": 1,
    });
    expect(report.pairwise.schemaValidationCount).toBe(1);
  });
});
