import { MatchingObservabilitySummaryService } from "../../src/modules/admin/matching-observability-summary.service";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { assertMatchingObservabilityReportContract } from "./support/contract";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("MatchingObservabilitySummaryService · wiring", () => {
  it("getSummary delegates to buildMatchingObservabilitySummary via Prisma", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const service = new MatchingObservabilitySummaryService(
      prisma as unknown as PrismaService,
    );

    const report = await service.getSummary({ limit: "100", sinceDays: "7" });

    expect(report.pairwise.totalInWindow).toBe(4);
    expect(report.window).toMatchObject({
      sinceDays: 7,
      rowCapForMetaParse: 100,
    });
    assertMatchingObservabilityReportContract(report);
  });
});
