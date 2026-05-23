import { buildMatchingObservabilitySummary } from "@peima/database";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("buildMatchingObservabilitySummary · matchAndPreview", () => {
  it("aggregates match_results, preview_pools, and join counts", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 500,
      sinceDays: 30,
      generatedAt: new Date("2026-05-23T10:00:00.000Z"),
    });

    expect(report.matchAndPreview).toEqual({
      matchResultsTotal: 7,
      previewPoolsTotal: 2,
      previewPoolsWithFinalizeMetaRow: 2,
      distinctPreviewPoolsWithSucceededSimulationInWindow: 1,
    });
  });
});
