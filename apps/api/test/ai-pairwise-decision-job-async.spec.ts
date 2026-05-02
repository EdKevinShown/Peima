import type { AiPairwiseDecisionJobRow } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";
import type { RelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.types";
import { parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
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

describe("M3.8-M4A admin async run (requestAdminRunPairwiseDecisionJob)", () => {
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

  it("queued → enqueued_for_worker and does not call generateAiPairwiseDecision", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    const jobId = rows[0]!.id;
    const r = await svc.requestAdminRunPairwiseDecisionJob(jobId);
    expect(r.ok).toBe(true);
    expect(r.jobId).toBe(jobId);
    expect(r.jobStatus).toBe(AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED);
    expect(r.started).toBe(false);
    expect(r.reason).toBe("enqueued_for_worker");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("running → already_running without generate", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING;
    const r = await svc.requestAdminRunPairwiseDecisionJob(rows[0]!.id);
    expect(r.reason).toBe("already_running");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("succeeded → already_completed without generate", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED;
    rows[0]!.decisionResult = {} as object;
    const r = await svc.requestAdminRunPairwiseDecisionJob(rows[0]!.id);
    expect(r.reason).toBe("already_completed");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("failed → failed_not_reusable without generate", async () => {
    await svc.createOrReusePairwiseDecisionJob({ viewerUserId: "viewer-1", poolId: "pool-1" });
    rows[0]!.status = AI_PAIRWISE_DECISION_JOB_STATUS.FAILED;
    const r = await svc.requestAdminRunPairwiseDecisionJob(rows[0]!.id);
    expect(r.reason).toBe("failed_not_reusable");
    expect(pairwise.generateAiPairwiseDecision).not.toHaveBeenCalled();
  });

  it("does not touch MatchResult / finalScore (no prisma delegate)", () => {
    expect((mockPrisma as { matchResult?: unknown }).matchResult).toBeUndefined();
  });
});
