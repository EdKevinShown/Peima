import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.constants";
import { MatchingController } from "../src/modules/matching/matching.controller";
import { MatchingDecisionComparisonService } from "../src/modules/matching/matching-decision-comparison.service";
import { MatchingFinalizePairwiseService } from "../src/modules/matching/matching-finalize-pairwise.service";
import { MatchingRrmRankingProposalService } from "../src/modules/matching/matching-rrm-ranking-proposal.service";
import { MatchingService } from "../src/modules/matching/matching.service";

const shortlistSnapshot = {
  schemaVersion: 1,
  sourceVersion: "relationship-shortlist-top2-v1",
  viewerUserId: "v1",
  poolId: "pool-1",
  shortlistFingerprint: "fp",
  candidates: [
    {
      candidateUserId: "cand-a",
      staticRank: 1,
      staticCompatibilityScore: 90,
      axisScoresSummary: { x: 0.5 },
      majorStrengths: ["s"],
      majorRisks: [],
      dealbreakerPassed: true,
      reasonSummary: "r1",
    },
    {
      candidateUserId: "cand-b",
      staticRank: 2,
      staticCompatibilityScore: 70,
      axisScoresSummary: { x: 0.4 },
      majorStrengths: [],
      majorRisks: [],
      dealbreakerPassed: true,
      reasonSummary: "r2",
    },
  ],
  generatedAt: "2026-05-01T12:00:00.000Z",
};

const decisionOk = {
  schemaVersion: 1,
  sourceVersion: "rrm-lite-pairwise-decision-v1",
  viewerUserId: "v1",
  poolId: "pool-1",
  candidateAUserId: "cand-a",
  candidateBUserId: "cand-b",
  winnerCandidateId: "cand-b",
  loserCandidateId: "cand-a",
  decisionConfidence: 0.85,
  decisionScoreA: 80,
  decisionScoreB: 60,
  dimensions: {
    conversationFit: 0.7,
    emotionalSafety: 0.7,
    conflictRepair: 0.7,
    progressionFit: 0.7,
    longTermFit: 0.7,
    riskControl: 0.7,
  },
  candidateA: {
    conversationFit: 0.7,
    emotionalSafety: 0.7,
    conflictRepair: 0.7,
    progressionFit: 0.7,
    longTermFit: 0.7,
    riskControl: 0.7,
    strongRisk: false,
    suggestedAction: "maintain",
    progressionWindow: "open",
    reasonSummary: "a",
  },
  candidateB: {
    conversationFit: 0.6,
    emotionalSafety: 0.6,
    conflictRepair: 0.6,
    progressionFit: 0.6,
    longTermFit: 0.6,
    riskControl: 0.6,
    strongRisk: false,
    suggestedAction: "maintain",
    progressionWindow: "open",
    reasonSummary: "b",
  },
  decisionReason: "ok",
  fallbackUsed: false,
  appliedToFinalScore: false,
  appliedToWorkerRanking: false,
  generatedAt: "2026-05-01T12:01:00.000Z",
};

describe("MatchingFinalizePairwiseService", () => {
  let finalizeMetaRows: unknown[] = [];
  let jobRows: Record<string, unknown>[] = [];
  let matchResultUpdate: jest.Mock;
  let svc: MatchingFinalizePairwiseService;

  const prev = {
    ENABLED: process.env.PAIRWISE_FINAL_MATCH_ENABLED,
    MODE: process.env.PAIRWISE_FINAL_MATCH_MODE,
    SOURCE: process.env.PAIRWISE_FINAL_MATCH_SOURCE_VERSION,
  };

  beforeEach(() => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "proposal_only";
    process.env.PAIRWISE_FINAL_MATCH_SOURCE_VERSION = "m3.8-pairwise-finalize-v1";
    finalizeMetaRows = [];
    jobRows = [];
    matchResultUpdate = jest.fn();
    const prisma = {
      pairwisePoolFinalizeMeta: {
        findUnique: jest.fn(async (args: { where: { viewerUserId_poolId: { viewerUserId: string; poolId: string } } }) => {
          const { viewerUserId, poolId } = args.where.viewerUserId_poolId;
          return (
            (finalizeMetaRows as { viewerUserId: string; poolId: string; meta: unknown }[]).find(
              (r) => r.viewerUserId === viewerUserId && r.poolId === poolId,
            ) ?? null
          );
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          finalizeMetaRows.push({ ...data });
          return { id: "meta-1", ...data };
        }),
      },
      aiPairwiseDecisionJob: {
        findFirst: jest.fn(async (args: { where: { id: string; viewerUserId: string; poolId: string } }) => {
          const { id, viewerUserId, poolId } = args.where;
          return jobRows.find((j) => j.id === id && j.viewerUserId === viewerUserId && j.poolId === poolId) ?? null;
        }),
      },
      matchResult: { update: matchResultUpdate },
    } as unknown as PrismaService;

    svc = new MatchingFinalizePairwiseService(prisma);
  });

  afterEach(() => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = prev.ENABLED;
    process.env.PAIRWISE_FINAL_MATCH_MODE = prev.MODE;
    process.env.PAIRWISE_FINAL_MATCH_SOURCE_VERSION = prev.SOURCE;
  });

  function pushJob(over: Record<string, unknown>) {
    jobRows.push({
      id: "job-1",
      viewerUserId: "v1",
      poolId: "pool-1",
      shortlistSnapshot,
      status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
      decisionResult: decisionOk,
      finalSourceShadow: null,
      ...over,
    });
  }

  it("queued → pending, no meta row", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED, decisionResult: null });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(r.status).toBe("pending");
    expect(r.finalMatchDecisionMeta).toBeNull();
    expect(finalizeMetaRows).toHaveLength(0);
  });

  it("running → pending", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(r.status).toBe("pending");
    expect(finalizeMetaRows).toHaveLength(0);
  });

  it("failed → static_fallback meta", async () => {
    pushJob({
      status: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED,
      decisionResult: null,
      finalSourceShadow: null,
    });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(r.status).toBe("finalized");
    expect(r.finalMatchDecisionMeta?.pairwiseProposalRecommendation).toBe("pairwise_unavailable");
    expect(r.finalMatchDecisionMeta?.sourceType).toBe("static_fallback");
    expect(r.finalMatchDecisionMeta?.selectedCandidateUserId).toBe("cand-a");
    expect(finalizeMetaRows).toHaveLength(1);
  });

  it("pairwise_winner_eligible + proposal_only → selected staticTop1, wouldChange true", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(r.status).toBe("finalized");
    expect(r.finalMatchDecisionMeta?.pairwiseProposalRecommendation).toBe("pairwise_winner_eligible");
    expect(r.finalMatchDecisionMeta?.selectedCandidateUserId).toBe("cand-a");
    expect(r.finalMatchDecisionMeta?.wouldChangeStaticResult).toBe(true);
    expect(r.finalMatchDecisionMeta?.mode).toBe("proposal_only");
  });

  it("pairwise_winner_eligible + shadow → selected staticTop1", async () => {
    process.env.PAIRWISE_FINAL_MATCH_MODE = "shadow";
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(r.finalMatchDecisionMeta?.selectedCandidateUserId).toBe("cand-a");
    expect(r.finalMatchDecisionMeta?.mode).toBe("shadow");
  });

  it("MODE=enabled + eligible → writes meta with pairwise winner as selected", async () => {
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(r.status).toBe("finalized");
    expect(r.finalMatchDecisionMeta?.selectedCandidateUserId).toBe("cand-b");
    expect(r.finalMatchDecisionMeta?.sourceType).toBe("pairwise_final");
    expect(finalizeMetaRows).toHaveLength(1);
  });

  it("already_frozen returns stored meta", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED, decisionResult: null });
    const first = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(first.status).toBe("finalized");
    const stored = (finalizeMetaRows[0] as { meta: Record<string, unknown> }).meta;
    jobRows[0] = {
      ...jobRows[0],
      status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
      decisionResult: decisionOk,
      finalSourceShadow: null,
    };
    const second = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(second.status).toBe("already_frozen");
    expect(second.finalMatchDecisionMeta).toEqual(stored);
  });

  it("wrong owner → 404", async () => {
    pushJob({});
    await expect(
      svc.finalizeWithPairwise({ viewerUserId: "other", poolId: "pool-1", pairwiseJobId: "job-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("wrong pool → 404", async () => {
    pushJob({});
    await expect(
      svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-x", pairwiseJobId: "job-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("repeated finalized → second already_frozen", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED });
    const a = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(a.status).toBe("finalized");
    const b = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(b.status).toBe("already_frozen");
    expect(b.finalMatchDecisionMeta).toEqual(a.finalMatchDecisionMeta);
  });

  it("does not call matchResult.update", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED });
    await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });

  it("response meta JSON has no raw scores / dimensions / strongRisk", async () => {
    pushJob({ status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED });
    const r = await svc.finalizeWithPairwise({ viewerUserId: "v1", poolId: "pool-1", pairwiseJobId: "job-1" });
    const s = JSON.stringify(r.finalMatchDecisionMeta);
    expect(s).not.toMatch(/decisionScore|dimensions|strongRisk/i);
  });
});

describe("MatchingController finalize-with-pairwise", () => {
  const prevMode = process.env.PAIRWISE_FINAL_MATCH_MODE;

  afterEach(() => {
    process.env.PAIRWISE_FINAL_MATCH_MODE = prevMode;
  });

  it("uses JWT userId only", async () => {
    process.env.PAIRWISE_FINAL_MATCH_MODE = "proposal_only";
    const finalizePairwise = {
      finalizeWithPairwise: jest.fn().mockResolvedValue({
        ok: true,
        status: "pending",
        finalMatchDecisionMeta: null,
      }),
    };
    const mod = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        { provide: MatchingService, useValue: {} },
        { provide: MatchingFinalizePairwiseService, useValue: finalizePairwise },
        { provide: MatchingRrmRankingProposalService, useValue: {} },
        { provide: MatchingDecisionComparisonService, useValue: {} },
      ],
    }).compile();
    const ctrl = mod.get(MatchingController);
    await ctrl.finalizeWithPairwise(
      { poolId: "pool-1", pairwiseJobId: "job-1" } as never,
      { user: { userId: "jwt-u" } } as never,
    );
    expect(finalizePairwise.finalizeWithPairwise).toHaveBeenCalledWith({
      viewerUserId: "jwt-u",
      poolId: "pool-1",
      pairwiseJobId: "job-1",
    });
  });
});
