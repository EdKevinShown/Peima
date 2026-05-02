import { Prisma } from "@peima/database";
import type { PrismaClient } from "@peima/database";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.constants";

jest.mock("../../../packages/ai-pairwise-decision-runner/src/pairwise-generate-from-env", () => ({
  generateAiPairwiseDecisionFromEnv: jest.fn(),
}));

import { generateAiPairwiseDecisionFromEnv } from "../../../packages/ai-pairwise-decision-runner/src/pairwise-generate-from-env";
import {
  recoverStuckAiPairwiseDecisionJobsOnce,
  runAiPairwiseDecisionWorkerPollOnce,
} from "../../../packages/ai-pairwise-decision-runner/src/pairwise-worker-poll";
import { registerAiPairwiseDecisionQueueWorker } from "../../../packages/ai-pairwise-decision-runner/src/worker-consumer";

function shortlistSnapshot() {
  const raw = {
    schemaVersion: 1,
    sourceVersion: "relationship-shortlist-top2-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    shortlistFingerprint: "fp-abc",
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
        majorRisks: ["g"],
        dealbreakerPassed: true,
        reasonSummary: "r2",
      },
    ],
    generatedAt: "2026-05-01T12:00:00.000Z",
  };
  const v = parseAndValidateRelationshipShortlistTop2(raw);
  if (!v.ok) throw new Error("fixture");
  return v.value;
}

function decisionOk() {
  const d = {
    schemaVersion: 1,
    sourceVersion: "rrm-lite-pairwise-decision-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    candidateAUserId: "cand-a",
    candidateBUserId: "cand-b",
    winnerCandidateId: "cand-a",
    loserCandidateId: "cand-b",
    decisionConfidence: 0.8,
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
  const v = parseAndValidateAiPairwiseDecision(d);
  if (!v.ok) throw new Error("decision fixture");
  return v.value;
}

describe("M3.8-M4A pairwise worker poll", () => {
  const genMock = generateAiPairwiseDecisionFromEnv as jest.MockedFunction<typeof generateAiPairwiseDecisionFromEnv>;

  beforeEach(() => {
    genMock.mockReset();
  });

  function buildPrismaMock(chain: {
    findFirstResult: { id: string } | null;
    updateManyClaimCount: number;
    rowAfterClaim: Record<string, unknown> & {
      id: string;
      viewerUserId: string;
      poolId: string;
      shortlistSnapshot: unknown;
      status: string;
      updatedAt: Date;
    };
  }) {
    const aiPairwiseDecisionJob = {
      findFirst: jest.fn().mockResolvedValue(chain.findFirstResult),
      updateMany: jest.fn().mockResolvedValue({ count: chain.updateManyClaimCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: chain.rowAfterClaim.id,
        viewerUserId: chain.rowAfterClaim.viewerUserId,
        poolId: chain.rowAfterClaim.poolId,
        shortlistSnapshot: chain.rowAfterClaim.shortlistSnapshot,
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(chain.rowAfterClaim, data);
        return { ...chain.rowAfterClaim, id: where.id };
      }),
    };
    return {
      aiPairwiseDecisionJob,
      prisma: { aiPairwiseDecisionJob } as unknown as PrismaClient,
    };
  }

  it("idle when no queued job", async () => {
    const { prisma } = buildPrismaMock({
      findFirstResult: null,
      updateManyClaimCount: 0,
      rowAfterClaim: {
        id: "x",
        viewerUserId: "v",
        poolId: "p",
        shortlistSnapshot: {},
        status: "queued",
        updatedAt: new Date(),
      },
    });
    const r = await runAiPairwiseDecisionWorkerPollOnce(prisma);
    expect(r).toBe("idle");
    expect(genMock).not.toHaveBeenCalled();
  });

  it("claim lost when updateMany count !== 1", async () => {
    const { prisma, aiPairwiseDecisionJob } = buildPrismaMock({
      findFirstResult: { id: "j1" },
      updateManyClaimCount: 0,
      rowAfterClaim: {
        id: "j1",
        viewerUserId: "viewer-1",
        poolId: "pool-1",
        shortlistSnapshot: shortlistSnapshot(),
        status: "running",
        updatedAt: new Date(),
      },
    });
    const r = await runAiPairwiseDecisionWorkerPollOnce(prisma);
    expect(r).toBe("claim_lost");
    expect(genMock).not.toHaveBeenCalled();
    expect(aiPairwiseDecisionJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("claim queued → running then succeeded + decisionResult on LLM ok", async () => {
    const snap = shortlistSnapshot();
    const row: Record<string, unknown> & {
      id: string;
      viewerUserId: string;
      poolId: string;
      shortlistSnapshot: typeof snap;
      status: string;
      updatedAt: Date;
    } = {
      id: "j1",
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      shortlistSnapshot: snap,
      status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
      updatedAt: new Date(),
    };
    genMock.mockResolvedValue({
      ok: true,
      value: decisionOk(),
      rawMeta: {
        provider: "p",
        model: "m",
        sourceVersion: "rrm-lite-pairwise-decision-v1",
        fallbackUsed: false,
      },
    });

    const { prisma, aiPairwiseDecisionJob } = buildPrismaMock({
      findFirstResult: { id: "j1" },
      updateManyClaimCount: 1,
      rowAfterClaim: row,
    });

    const r = await runAiPairwiseDecisionWorkerPollOnce(prisma);
    expect(r).toBe("completed");
    expect(genMock).toHaveBeenCalledTimes(1);
    expect(aiPairwiseDecisionJob.update).toHaveBeenCalled();
    expect(row.status).toBe(AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED);
    expect(row.decisionResult).toBeDefined();
    expect(parseAndValidateAiPairwiseDecision(row.decisionResult).ok).toBe(true);
    expect(row.finalSourceShadow).toMatchObject({
      schemaVersion: 1,
      sourceVersion: "pairwise-final-source-shadow-v1",
      mode: "shadow",
      proposalRecommendation: "pairwise_winner_eligible",
      shadowSelectedCandidateUserId: "cand-a",
      wouldChangeStaticResult: false,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
    });
    expect(row.finalSourceShadow).not.toHaveProperty("decisionScoreA");
  });

  it("claim queued → running then failed + failureDetail on LLM failure", async () => {
    const snap = shortlistSnapshot();
    const row: Record<string, unknown> & {
      id: string;
      viewerUserId: string;
      poolId: string;
      shortlistSnapshot: typeof snap;
      status: string;
      updatedAt: Date;
    } = {
      id: "j1",
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      shortlistSnapshot: snap,
      status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
      updatedAt: new Date(),
    };
    genMock.mockResolvedValue({
      ok: false,
      failureDetail: { code: "disabled", message: "off" },
    });

    const { prisma } = buildPrismaMock({
      findFirstResult: { id: "j1" },
      updateManyClaimCount: 1,
      rowAfterClaim: row,
    });

    const r = await runAiPairwiseDecisionWorkerPollOnce(prisma);
    expect(r).toBe("completed");
    expect(row.status).toBe(AI_PAIRWISE_DECISION_JOB_STATUS.FAILED);
    expect(row.failureDetail).toMatchObject({ code: "disabled" });
    expect(row.decisionResult).toBe(Prisma.JsonNull);
    expect(row.finalSourceShadow).toMatchObject({
      proposalRecommendation: "pairwise_unavailable",
      shadowSelectedCandidateUserId: "cand-a",
      wouldChangeStaticResult: false,
      fallbackReason: "pairwise_job_not_succeeded_or_missing_decision",
    });
  });

  it("recoverStuckAiPairwiseDecisionJobsOnce resets stale running → queued (status only; no column clears in API)", async () => {
    const aiPairwiseDecisionJob = {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const prisma = { aiPairwiseDecisionJob } as unknown as PrismaClient;
    const out = await recoverStuckAiPairwiseDecisionJobsOnce(prisma, {
      stuckTimeoutMs: 60_000,
      now: new Date("2020-01-02T12:00:00.000Z"),
    });
    expect(out.resetCount).toBe(2);
    expect(aiPairwiseDecisionJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING,
        updatedAt: { lt: expect.any(Date) },
      },
      data: { status: AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED },
    });
  });

  it("registerAiPairwiseDecisionQueueWorker does not start polling when disabled", () => {
    const prevE = process.env.AI_PAIRWISE_DECISION_ENABLED;
    const prevW = process.env.AI_PAIRWISE_DECISION_WORKER_ENABLED;
    process.env.AI_PAIRWISE_DECISION_ENABLED = "0";
    process.env.AI_PAIRWISE_DECISION_WORKER_ENABLED = "0";
    const spy = jest.spyOn(global, "setInterval");
    registerAiPairwiseDecisionQueueWorker();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    process.env.AI_PAIRWISE_DECISION_ENABLED = prevE;
    process.env.AI_PAIRWISE_DECISION_WORKER_ENABLED = prevW;
  });

  it("mock prisma has no MatchResult delegate", () => {
    const { prisma } = buildPrismaMock({
      findFirstResult: null,
      updateManyClaimCount: 0,
      rowAfterClaim: {
        id: "x",
        viewerUserId: "v",
        poolId: "p",
        shortlistSnapshot: {},
        status: "queued",
        updatedAt: new Date(),
      },
    });
    expect((prisma as { matchResult?: unknown }).matchResult).toBeUndefined();
  });
});
