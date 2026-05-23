import { buildMatchingObservabilitySummary } from "@peima/database";
import { assertMatchingObservabilityReportContract } from "./support/contract";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("matching observability report contract", () => {
  it("rich mock output satisfies full section contract and has no forbidden keys", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 100,
      sinceDays: 7,
      m42SanitizedRunRecordExists: false,
    });
    assertMatchingObservabilityReportContract(report);
  });

  it("empty mock output still satisfies contract", async () => {
    const prisma = createMatchingObservabilityPrismaMock("empty");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 500,
      sinceDays: 30,
    });
    assertMatchingObservabilityReportContract(report);
  });
});
