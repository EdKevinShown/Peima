import { buildMatchingObservabilitySummary } from "@peima/database";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("buildMatchingObservabilitySummary · simulation", () => {
  it("aggregates job status, item status, error codes, and schema_validation count", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 500,
      sinceDays: 30,
      generatedAt: new Date("2026-05-23T10:00:00.000Z"),
    });

    expect(report.simulation.jobStatusDistributionInWindow).toEqual({ succeeded: 2 });
    expect(report.simulation.itemStatusDistributionInWindow).toEqual({
      succeeded: 3,
      failed: 1,
    });
    expect(report.simulation.itemErrorCodeDistributionInWindow).toEqual({
      schema_validation: 1,
      "(null)": 1,
    });
    expect(report.simulation.failedItemCountInWindow).toBe(1);
    expect(report.simulation.schemaValidationItemCountInWindow).toBe(1);
  });
});
