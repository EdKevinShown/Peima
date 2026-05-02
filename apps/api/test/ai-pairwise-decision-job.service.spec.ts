import { AI_PAIRWISE_DECISION_SOURCE_VERSION } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.schema";
import type { AiPairwiseDecisionJobRow } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";
import type { RelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.types";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
import { AiPairwiseDecisionJobService } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.constants";
import type { PrismaService } from "../src/common/prisma/prisma.service";

function shortlist(): RelationshipShortlistTop2 {
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

describe("AiPairwiseDecisionJobService", () => {
  let rows: AiPairwiseDecisionJobRow[];
  let mockPrisma: PrismaService;
  let top2: { buildRelationshipShortlistTop2: jest.Mock };
  let pairwise: { generateAiPairwiseDecision: jest.Mock };
  let svc: AiPairwiseDecisionJobService;

  beforeEach(() => {
    rows = [];
    mockPrisma = {
      aiPairwiseDecisionJob: {
        findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
          const st = args.where.status as { in: string[] } | undefined;
          const inList = st?.in ?? [];
          return (
            rows.find(
              (r) =>
                r.viewerUserId === args.where.viewerUserId &&
                r.poolId === args.where.poolId &&
                r.shortlistFingerprint === args.where.shortlistFingerprint &&
                r.sourceVersion === args.where.sourceVersion &&
                inList.includes(r.status),
            ) ?? null
          );
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `id-${rows.length + 1}`,
            ...data,
            decisionResult: null,
            failureDetail: null,
            fallbackUsed: null,
            startedAt: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as AiPairwiseDecisionJobRow;
          rows.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
          const r = rows.find((x) => x.id === where.id);
          if (!r) throw new Error("not found");
          return r;
        }),
        updateMany: jest.fn(
          async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
            const r = rows.find((x) => x.id === where.id);
            if (!r || (where.status != null && r.status !== where.status)) return { count: 0 };
            Object.assign(r, data);
            r.updatedAt = new Date();
            return { count: 1 };
          },
        ),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const r = rows.find((x) => x.id === where.id);
          if (!r) throw new Error("not found");
          Object.assign(r, data);
          r.updatedAt = new Date();
          return { ...r };
        }),
      },
    } as unknown as PrismaService;

    top2 = { buildRelationshipShortlistTop2: jest.fn().mockResolvedValue(shortlist()) };
    pairwise = { generateAiPairwiseDecision: jest.fn() };
    svc = new AiPairwiseDecisionJobService(mockPrisma, top2 as never, pairwise as never);
  });

  it("create job persists shortlistSnapshot", async () => {
    const r = await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    expect(r.reused).toBe(false);
    expect(mockPrisma.aiPairwiseDecisionJob.create).toHaveBeenCalled();
    const arg = (mockPrisma.aiPairwiseDecisionJob.create as jest.Mock).mock.calls[0][0];
    expect(arg.data.shortlistSnapshot).toBeDefined();
    expect(parseAndValidateRelationshipShortlistTop2(arg.data.shortlistSnapshot).ok).toBe(true);
  });

  it("reuses queued job for same viewer + pool + fingerprint + sourceVersion", async () => {
    const a = await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    const b = await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    expect(b.reused).toBe(true);
    expect(b.job.id).toBe(a.job.id);
  });

  it("reuses succeeded job", async () => {
    const created = await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED;
    rows[0]!.decisionResult = decisionOk() as unknown as object;
    const again = await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    expect(again.reused).toBe(true);
    expect(again.job.id).toBe(created.job.id);
  });

  it("does not reuse failed job (creates a new row)", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.FAILED;
    rows[0]!.failureDetail = { code: "disabled", message: "x" } as object;
    const second = await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    expect(second.reused).toBe(false);
    expect(second.job.id).not.toBe(rows[0]!.id);
    expect(rows).toHaveLength(2);
  });

  it("run queued job success writes decisionResult and succeeded", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    const jobId = rows[0]!.id;
    pairwise.generateAiPairwiseDecision.mockResolvedValue({ ok: true, value: decisionOk(), rawMeta: {} });
    const run = await svc.runPairwiseDecisionJobSync(jobId);
    expect(run.outcome).toBe("ran");
    expect(run.job.status).toBe(AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED);
    expect(run.job.decisionResult).not.toBeNull();
    expect(parseAndValidateAiPairwiseDecision(run.job.decisionResult).ok).toBe(true);
    expect(run.job.finalSourceShadow).toMatchObject({
      schemaVersion: 1,
      sourceVersion: "pairwise-final-source-shadow-v1",
      mode: "shadow",
      proposalRecommendation: "pairwise_winner_eligible",
      shadowSelectedCandidateUserId: "cand-a",
      wouldChangeStaticResult: false,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
    });
  });

  it("run success with winner cand-b sets wouldChangeStaticResult on finalSourceShadow", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    const alt = { ...decisionOk(), winnerCandidateId: "cand-b", loserCandidateId: "cand-a" };
    const v = parseAndValidateAiPairwiseDecision(alt);
    if (!v.ok) throw new Error("fixture");
    pairwise.generateAiPairwiseDecision.mockResolvedValue({ ok: true, value: v.value, rawMeta: {} });
    const run = await svc.runPairwiseDecisionJobSync(rows[0]!.id);
    expect(run.job.finalSourceShadow?.wouldChangeStaticResult).toBe(true);
    expect(run.job.finalSourceShadow?.shadowSelectedCandidateUserId).toBe("cand-b");
  });

  it("run queued job failure writes failureDetail and failed", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    const jobId = rows[0]!.id;
    pairwise.generateAiPairwiseDecision.mockResolvedValue({
      ok: false,
      failureDetail: { code: "disabled", message: "off" },
    });
    const run = await svc.runPairwiseDecisionJobSync(jobId);
    expect(run.outcome).toBe("ran");
    expect(run.job.status).toBe(AI_PAIRWISE_DECISION_JOB_STATUS.FAILED);
    expect(run.job.failureDetail?.code).toBe("disabled");
    expect(run.job.decisionResult).toBeNull();
    expect(run.job.finalSourceShadow?.proposalRecommendation).toBe("pairwise_unavailable");
    expect(run.job.finalSourceShadow?.shadowSelectedCandidateUserId).toBe("cand-a");
  });

  it("getPairwiseDecisionJobForViewer omits finalSourceShadow even when stored", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED;
    rows[0]!.decisionResult = decisionOk() as unknown as object;
    rows[0]!.finalSourceShadow = {
      schemaVersion: 1,
      sourceVersion: "pairwise-final-source-shadow-v1",
      mode: "shadow",
      pairwiseJobId: rows[0]!.id,
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      staticTop1CandidateUserId: "cand-a",
      pairwiseWinnerCandidateUserId: "cand-a",
      proposalRecommendation: "pairwise_winner_eligible",
      shadowSelectedCandidateUserId: "cand-a",
      wouldChangeStaticResult: false,
      fallbackReason: null,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      generatedAt: "2026-05-01T12:00:00.000Z",
    } as object;
    const j = await svc.getPairwiseDecisionJobForViewer(rows[0]!.id, "viewer-1");
    expect(j.finalSourceShadow).toBeNull();
  });

  it("returns already_running when job is running", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING;
    const run = await svc.runPairwiseDecisionJobSync(rows[0]!.id);
    expect(run.outcome).toBe("already_running");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("returns failed_not_reusable when job already failed", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.FAILED;
    const run = await svc.runPairwiseDecisionJobSync(rows[0]!.id);
    expect(run.outcome).toBe("failed_not_reusable");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("returns already_completed when job succeeded", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED;
    rows[0]!.decisionResult = decisionOk() as unknown as object;
    const run = await svc.runPairwiseDecisionJobSync(rows[0]!.id);
    expect(run.outcome).toBe("already_completed");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("getPairwiseDecisionJob returns snapshots that validate", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    const j = await svc.getPairwiseDecisionJob(rows[0]!.id);
    expect(parseAndValidateRelationshipShortlistTop2(j.shortlistSnapshot).ok).toBe(true);
    expect(j.appliedToFinalScore).toBe(false);
    expect(j.appliedToWorkerRanking).toBe(false);
    expect(j.sourceVersion).toBe(AI_PAIRWISE_DECISION_SOURCE_VERSION);
  });

  it("does not touch MatchResult or finalScore (no prisma delegate)", () => {
    expect((mockPrisma as { matchResult?: unknown }).matchResult).toBeUndefined();
  });
});
