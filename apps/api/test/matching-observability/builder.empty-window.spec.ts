import { buildMatchingObservabilitySummary } from "@peima/database";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("buildMatchingObservabilitySummary · empty window", () => {
  it("returns zeroed sections without throwing", async () => {
    const prisma = createMatchingObservabilityPrismaMock("empty");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 500,
      sinceDays: 30,
      m42SanitizedRunRecordExists: true,
      generatedAt: new Date("2026-05-23T10:00:00.000Z"),
    });

    expect(report.pairwise.totalInWindow).toBe(0);
    expect(report.pairwise.fallbackUsed.rateTrueOverAll).toBeNull();
    expect(report.simulation.failedItemCountInWindow).toBe(0);
    expect(report.finalizeMeta.totalInWindow).toBe(0);
    expect(report.finalizeMeta.metaRowsParsed).toBe(0);
    expect(report.matchAndPreview.matchResultsTotal).toBe(0);
    expect(report.m42AlignmentHint.sanitizedRunRecordPath).toBe(
      "docs/M4/M4.2-batch-regression-sanitized-run-record.md",
    );
  });
});
