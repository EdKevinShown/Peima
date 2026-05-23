import { buildMatchingObservabilitySummary } from "@peima/database";
import { createMatchingObservabilityPrismaMock } from "./support/prisma.mock";

describe("buildMatchingObservabilitySummary · finalizeMeta", () => {
  it("parses safe meta fields and records parse error buckets", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 500,
      sinceDays: 30,
      generatedAt: new Date("2026-05-23T10:00:00.000Z"),
    });

    expect(report.finalizeMeta.totalInWindow).toBe(3);
    expect(report.finalizeMeta.totalAllTime).toBe(10);
    expect(report.finalizeMeta.frozenTrueInWindow).toBe(1);
    expect(report.finalizeMeta.frozenTrueAllTime).toBe(3);
    expect(report.finalizeMeta.metaRowsParsed).toBe(3);
    expect(report.finalizeMeta.metaStatsSampled).toBe(false);
    expect(report.finalizeMeta.wouldChangeStaticResult).toEqual({
      trueCount: 1,
      parsedBooleanCount: 1,
      rateOverParsed: 1,
    });
    expect(report.finalizeMeta.fallbackReasonDistribution).toEqual({
      pairwise_timeout: 1,
    });
    expect(report.finalizeMeta.pairwiseProposalRecommendationDistribution).toEqual({
      hold: 1,
    });
    expect(report.finalizeMeta.appliedToFinalScoreTrueCountAmongParsed).toBe(0);
    expect(report.finalizeMeta.appliedToWorkerRankingTrueCountAmongParsed).toBe(1);
    expect(report.finalizeMeta.metaParseErrorCount).toBe(2);
    expect(report.finalizeMeta.metaParseErrorBuckets).toMatchObject({
      json_string_parse_fail: 1,
      null_meta: 1,
    });
  });

  it("sets metaStatsSampled when window rows exceed limit", async () => {
    const prisma = createMatchingObservabilityPrismaMock("rich");
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit: 2,
      sinceDays: 30,
      generatedAt: new Date("2026-05-23T10:00:00.000Z"),
    });

    expect(report.finalizeMeta.totalInWindow).toBe(3);
    expect(report.finalizeMeta.metaStatsSampled).toBe(true);
    expect(report.finalizeMeta.metaRowsParsed).toBe(2);
  });
});
