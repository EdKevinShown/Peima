import {
  aggregateRrmObservationSummary,
  parseObservationLimit,
  RrmObservationSummaryService,
} from "../src/modules/admin/rrm-observation-summary.service";
import { PrismaService } from "../src/common/prisma/prisma.service";

describe("RrmObservationSummaryService", () => {
  it("parses limit with default and max clamp", () => {
    expect(parseObservationLimit(undefined)).toBe(50);
    expect(parseObservationLimit("")).toBe(50);
    expect(parseObservationLimit("abc")).toBe(50);
    expect(parseObservationLimit("-3")).toBe(50);
    expect(parseObservationLimit("20")).toBe(20);
    expect(parseObservationLimit("999")).toBe(200);
  });

  it("aggregates anonymous summary and tolerates malformed rows", () => {
    const rows = [
      {
        matchInsights: {
          scoreShadowV2: { ok: true },
          scoreShadow: { legacy: true },
          rrmV2Top2Selector: { ok: true },
          rrmDecisionShadow: {
            shadow: { decision: "same_as_baseline" },
            inputPresence: {
              scoreShadowV2: true,
              rrmV2Top2Selector: true,
              selectedTop2: true,
              scoreShadowV1LegacyPresent: false,
            },
          },
          rrmBoundedDecision: {
            decision: "would_use_baseline",
            fallbackReason: null,
          },
        },
      },
      {
        matchInsights: {
          rrmDecisionShadow: 123, // malformed
        },
      },
      {
        matchInsights: null, // malformed row
      },
    ];

    const out = aggregateRrmObservationSummary(rows, 50);
    expect(out.sampleSize).toBe(3);
    expect(out.coverage.withScoreShadowV2).toBe(1);
    expect(out.coverage.withScoreShadowV1Legacy).toBe(1);
    expect(out.coverage.withRrmV2Top2Selector).toBe(1);
    expect(out.coverage.withRrmDecisionShadow).toBe(2);
    expect(out.coverage.withRrmBoundedDecision).toBe(1);
    expect(out.coverage.withResolvedProjectionUnavailableInDbNote).toBe(true);
    expect(out.decisionShadow.same_as_baseline).toBe(1);
    expect(out.boundedDecision.would_use_baseline).toBe(1);
    expect(out.inputPresence.selectedTop2True).toBe(1);
    expect(out.quality.malformedCount).toBe(1);
    expect(out.quality.parseErrorCount).toBe(1);
    expect(out.quality.unexpectedExceptionCount).toBe(0);
  });

  it("queries latest rows with clamped limit", async () => {
    const prisma = {
      matchResult: {
        findMany: jest.fn().mockResolvedValue([{ matchInsights: {} }]),
      },
    };
    const service = new RrmObservationSummaryService(prisma as unknown as PrismaService);
    const out = await service.getSummary("999");
    expect(prisma.matchResult.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { matchInsights: true },
    });
    expect(out.limit).toBe(200);
    expect(out.sampleSize).toBe(1);
  });
});
