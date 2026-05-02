import type { MatchResult } from "@peima/database";
import { resolveMatchResultDisplay } from "../src/modules/matching/matching-result-display";

function mr(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-1",
    userId: "viewer-1",
    candidateUserId: "cand-static",
    batchId: "batch-1",
    finalScore: 0.82,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  } as MatchResult;
}

function metaV1(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourceVersion: "m3.8-pairwise-finalize-v1",
    sourceType: "static_fallback",
    mode: "shadow",
    pairwiseJobId: "job-1",
    pairwiseProposalRecommendation: "pairwise_unavailable",
    staticTop1CandidateUserId: "cand-static",
    pairwiseWinnerCandidateUserId: null,
    selectedCandidateUserId: "cand-static",
    fallbackReason: "x",
    wouldChangeStaticResult: false,
    frozen: true,
    frozenAt: "2026-05-01T12:00:00.000Z",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-05-01T12:00:00.000Z",
    ...over,
  };
}

describe("resolveMatchResultDisplay (M3.8-M13)", () => {
  const prev = {
    ENABLED: process.env.PAIRWISE_FINAL_MATCH_ENABLED,
    MODE: process.env.PAIRWISE_FINAL_MATCH_MODE,
  };

  afterEach(() => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = prev.ENABLED;
    process.env.PAIRWISE_FINAL_MATCH_MODE = prev.MODE;
  });

  function mockPrisma(opts: {
    finalizeRows?: { frozen: boolean; meta: unknown }[];
    userIds?: Set<string>;
  }) {
    const userIds = opts.userIds ?? new Set(["cand-static", "cand-winner"]);
    return {
      pairwisePoolFinalizeMeta: {
        findMany: jest.fn(async () => opts.finalizeRows ?? []),
      },
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          userIds.has(where.id) ? { id: where.id } : null,
        ),
      },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;
  }

  it("flag off → displayCandidateUserId = original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [{ frozen: true, meta: metaV1({ selectedCandidateUserId: "cand-winner", mode: "enabled" }) }],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
    expect(r.finalMatchDecisionMeta).toBeNull();
  });

  it("ENABLED=1 but mode proposal_only → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "proposal_only";
    const prisma = mockPrisma({
      finalizeRows: [{ frozen: true, meta: metaV1({ mode: "enabled", selectedCandidateUserId: "cand-winner" }) }],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("ENABLED=1 but mode shadow → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "shadow";
    const prisma = mockPrisma({
      finalizeRows: [{ frozen: true, meta: metaV1({ mode: "enabled", selectedCandidateUserId: "cand-winner" }) }],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("enabled + frozen pairwise_final meta → display = selected (winner)", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "pairwise_final",
            pairwiseProposalRecommendation: "pairwise_winner_eligible",
            pairwiseWinnerCandidateUserId: "cand-winner",
            selectedCandidateUserId: "cand-winner",
            staticTop1CandidateUserId: "cand-static",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-winner");
    expect(r.displaySourceType).toBe("pairwise_final");
    expect(r.finalMatchDecisionMeta?.selectedCandidateUserId).toBe("cand-winner");
    const leaked = JSON.stringify(r.finalMatchDecisionMeta);
    expect(leaked).not.toMatch(/strongRisk|decisionScore|dimensions/i);
  });

  it("enabled + static_fallback meta → display staticTop1", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "static_fallback",
            pairwiseProposalRecommendation: "pairwise_unavailable",
            selectedCandidateUserId: "cand-static",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("static_fallback");
  });

  it("no meta rows → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({ finalizeRows: [] });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("unsafe pool binding (staticTop1 mismatch) → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "pairwise_final",
            staticTop1CandidateUserId: "other-pool-top1",
            selectedCandidateUserId: "cand-winner",
            pairwiseWinnerCandidateUserId: "cand-winner",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("selected user missing → skip row, original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "pairwise_final",
            staticTop1CandidateUserId: "cand-static",
            selectedCandidateUserId: "ghost-user",
            pairwiseWinnerCandidateUserId: "ghost-user",
          }),
        },
      ],
      userIds: new Set(["cand-static"]),
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("appliedToFinalScore true → rejected parse, original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            appliedToFinalScore: true,
            selectedCandidateUserId: "cand-winner",
            pairwiseWinnerCandidateUserId: "cand-winner",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });
});
