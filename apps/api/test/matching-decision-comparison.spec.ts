import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PreviewPoolService } from "../src/modules/preview-pool/preview-pool.service";
import { MatchingDecisionComparisonService } from "../src/modules/matching/matching-decision-comparison.service";
import { M4_1_DECISION_COMPARISON_NOTE } from "../src/modules/matching/matching-decision-comparison.types";
import { MatchingRrmRankingProposalService } from "../src/modules/matching/matching-rrm-ranking-proposal.service";

const VIEWER = "viewer_v1";
const POOL = "pool_p1";

function validFinalizeMeta(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourceVersion: "test-v1",
    sourceType: "static_fallback",
    mode: "enabled",
    pairwiseJobId: "pair_job_1",
    pairwiseProposalRecommendation: "pairwise_winner_eligible",
    staticTop1CandidateUserId: "static_top1",
    pairwiseWinnerCandidateUserId: "pair_winner",
    selectedCandidateUserId: "static_top1",
    fallbackReason: null,
    wouldChangeStaticResult: false,
    frozen: true,
    frozenAt: "2026-01-01T00:00:00.000Z",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MatchingDecisionComparisonService (unit, no DB)", () => {
  it("throws NotFoundException when pool not found", async () => {
    const prisma = {
      previewPool: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const preview = {} as PreviewPoolService;
    const rrm = {} as MatchingRrmRankingProposalService;
    const svc = new MatchingDecisionComparisonService(prisma, preview, rrm);
    await expect(svc.getComparison(VIEWER, POOL)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns four sources when all present and comparison booleans", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mr1",
          candidateUserId: "static_top1",
          finalScore: 0.5,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      },
      pairwisePoolFinalizeMeta: {
        findUnique: jest.fn().mockResolvedValue({
          frozen: true,
          meta: validFinalizeMeta({ selectedCandidateUserId: "static_top1" }),
        }),
      },
    } as unknown as PrismaService;

    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue({
        shortlist: { candidateUserIds: ["static_top1", "static_top2"], size: 2 },
      }),
    } as unknown as PreviewPoolService;

    const rrm = {
      getReadonlyProposal: jest.fn().mockResolvedValue({
        simulationJobId: "sim1",
        rrmTop1CandidateUserId: "static_top1",
        wouldChangeStaticResult: false,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToDisplayCandidate: false,
      }),
    } as unknown as MatchingRrmRankingProposalService;

    const svc = new MatchingDecisionComparisonService(prisma, preview, rrm);
    const out = await svc.getComparison(VIEWER, POOL);

    expect(out.mode).toBe("readonly");
    expect(out.sourceVersion).toBe("m4.1-three-source-decision-comparison-readonly-v1");
    expect(out.staticShortlist?.top1CandidateUserId).toBe("static_top1");
    expect(out.staticShortlist?.top2CandidateUserId).toBe("static_top2");
    expect(out.staticShortlist?.shortlistSize).toBe(2);
    expect(out.matchResultOriginal?.candidateUserId).toBe("static_top1");
    expect(out.pairwiseFrozen).toMatchObject({ present: true, selectedCandidateUserId: "static_top1" });
    expect(out.rrmReadonly).toMatchObject({ present: true, simulationJobId: "sim1" });
    expect(out.comparisonSummary.staticTop1EqualsMatchResultOriginal).toBe(true);
    expect(out.comparisonSummary.staticTop1EqualsPairwiseSelected).toBe(true);
    expect(out.comparisonSummary.staticTop1EqualsRrmTop1).toBe(true);
    expect(out.comparisonSummary.matchResultOriginalEqualsPairwiseSelected).toBe(true);
    expect(out.comparisonSummary.matchResultOriginalEqualsRrmTop1).toBe(true);
    expect(out.comparisonSummary.pairwiseSelectedEqualsRrmTop1).toBe(true);
    expect(out.comparisonSummary.notes).toEqual([]);
  });

  it("PAIRWISE_META_MISSING when no finalize row", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mr1",
          candidateUserId: "a",
          finalScore: null,
          createdAt: new Date(),
        }),
      },
      pairwisePoolFinalizeMeta: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue({
        shortlist: { candidateUserIds: ["a"], size: 1 },
      }),
    } as unknown as PreviewPoolService;
    const rrm = {
      getReadonlyProposal: jest.fn().mockResolvedValue({
        simulationJobId: "s",
        rrmTop1CandidateUserId: "a",
        wouldChangeStaticResult: false,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToDisplayCandidate: false,
      }),
    } as unknown as MatchingRrmRankingProposalService;
    const svc = new MatchingDecisionComparisonService(prisma, preview, rrm);
    const out = await svc.getComparison(VIEWER, POOL);
    expect(out.pairwiseFrozen).toEqual({ present: false });
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.PAIRWISE_META_MISSING);
  });

  it("PAIRWISE_META_MISSING when frozen is false", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: { findFirst: jest.fn().mockResolvedValue(null) },
      pairwisePoolFinalizeMeta: {
        findUnique: jest.fn().mockResolvedValue({ frozen: false, meta: {} }),
      },
    } as unknown as PrismaService;
    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue(undefined),
    } as unknown as PreviewPoolService;
    const rrm = {
      getReadonlyProposal: jest.fn().mockRejectedValue(
        new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: "x",
            code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL",
          },
          HttpStatus.NOT_FOUND,
        ),
      ),
    } as unknown as MatchingRrmRankingProposalService;
    const svc = new MatchingDecisionComparisonService(prisma, preview, rrm);
    const out = await svc.getComparison(VIEWER, POOL);
    expect(out.pairwiseFrozen).toEqual({ present: false });
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.PAIRWISE_META_MISSING);
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.STATIC_SHORTLIST_MISSING);
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.MATCH_RESULT_MISSING);
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.RRM_PROPOSAL_MISSING);
    expect(out.rrmReadonly).toEqual({ present: false, code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL" });
  });

  it("RRM_PROPOSAL_MISSING when RRM throws NO_SUCCEEDED without failing whole request", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mr1",
          candidateUserId: "x",
          finalScore: 0.1,
          createdAt: new Date(),
        }),
      },
      pairwisePoolFinalizeMeta: {
        findUnique: jest.fn().mockResolvedValue({
          frozen: true,
          meta: validFinalizeMeta({
            staticTop1CandidateUserId: "x",
            selectedCandidateUserId: "x",
          }),
        }),
      },
    } as unknown as PrismaService;
    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue({
        shortlist: { candidateUserIds: ["x", "y"], size: 2 },
      }),
    } as unknown as PreviewPoolService;
    const rrm = {
      getReadonlyProposal: jest.fn().mockRejectedValue(
        new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: "No completed AI simulation job exists for this pool.",
            code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL",
          },
          HttpStatus.NOT_FOUND,
        ),
      ),
    } as unknown as MatchingRrmRankingProposalService;
    const svc = new MatchingDecisionComparisonService(prisma, preview, rrm);
    const out = await svc.getComparison(VIEWER, POOL);
    expect(out.rrmReadonly).toEqual({ present: false, code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL" });
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.RRM_PROPOSAL_MISSING);
    expect(out.comparisonSummary.matchResultOriginalEqualsRrmTop1).toBe(null);
  });

  it("MATCH_RESULT_MISSING when no MatchResult", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: { findFirst: jest.fn().mockResolvedValue(null) },
      pairwisePoolFinalizeMeta: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue({
        shortlist: { candidateUserIds: ["a"], size: 1 },
      }),
    } as unknown as PreviewPoolService;
    const rrm = {
      getReadonlyProposal: jest.fn().mockResolvedValue({
        simulationJobId: "s",
        rrmTop1CandidateUserId: "a",
        wouldChangeStaticResult: false,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToDisplayCandidate: false,
      }),
    } as unknown as MatchingRrmRankingProposalService;
    const out = await new MatchingDecisionComparisonService(prisma, preview, rrm).getComparison(VIEWER, POOL);
    expect(out.matchResultOriginal).toBeNull();
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.MATCH_RESULT_MISSING);
    expect(out.comparisonSummary.staticTop1EqualsMatchResultOriginal).toBe(null);
  });

  it("STATIC_SHORTLIST_MISSING when contract missing", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mr1",
          candidateUserId: "m1",
          finalScore: null,
          createdAt: new Date(),
        }),
      },
      pairwisePoolFinalizeMeta: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue(undefined),
    } as unknown as PreviewPoolService;
    const rrm = {
      getReadonlyProposal: jest.fn().mockResolvedValue({
        simulationJobId: "s",
        rrmTop1CandidateUserId: "m1",
        wouldChangeStaticResult: false,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToDisplayCandidate: false,
      }),
    } as unknown as MatchingRrmRankingProposalService;
    const out = await new MatchingDecisionComparisonService(prisma, preview, rrm).getComparison(VIEWER, POOL);
    expect(out.staticShortlist).toBeNull();
    expect(out.comparisonSummary.notes).toContain(M4_1_DECISION_COMPARISON_NOTE.STATIC_SHORTLIST_MISSING);
    expect(out.comparisonSummary.staticTop1EqualsRrmTop1).toBe(null);
  });

  it("divergent ids produce false equality flags where both sides exist", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: POOL, userId: VIEWER, status: "active" }),
      },
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mr1",
          candidateUserId: "match_only",
          finalScore: 0.2,
          createdAt: new Date(),
        }),
      },
      pairwisePoolFinalizeMeta: {
        findUnique: jest.fn().mockResolvedValue({
          frozen: true,
          meta: validFinalizeMeta({
            staticTop1CandidateUserId: "static_top1",
            selectedCandidateUserId: "pair_sel",
            pairwiseWinnerCandidateUserId: "pair_sel",
          }),
        }),
      },
    } as unknown as PrismaService;
    const preview = {
      buildShortlistContractV0ForPool: jest.fn().mockResolvedValue({
        shortlist: { candidateUserIds: ["static_top1", "static_top2"], size: 2 },
      }),
    } as unknown as PreviewPoolService;
    const rrm = {
      getReadonlyProposal: jest.fn().mockResolvedValue({
        simulationJobId: "s",
        rrmTop1CandidateUserId: "rrm_top",
        wouldChangeStaticResult: true,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToDisplayCandidate: false,
      }),
    } as unknown as MatchingRrmRankingProposalService;
    const out = await new MatchingDecisionComparisonService(prisma, preview, rrm).getComparison(VIEWER, POOL);
    expect(out.comparisonSummary.staticTop1EqualsMatchResultOriginal).toBe(false);
    expect(out.comparisonSummary.staticTop1EqualsPairwiseSelected).toBe(false);
    expect(out.comparisonSummary.staticTop1EqualsRrmTop1).toBe(false);
    expect(out.comparisonSummary.matchResultOriginalEqualsPairwiseSelected).toBe(false);
    expect(out.comparisonSummary.matchResultOriginalEqualsRrmTop1).toBe(false);
    expect(out.comparisonSummary.pairwiseSelectedEqualsRrmTop1).toBe(false);
    expect(new Set(out.comparisonSummary.allSelectedIds).size).toBe(out.comparisonSummary.uniqueCandidateCount);
  });
});
