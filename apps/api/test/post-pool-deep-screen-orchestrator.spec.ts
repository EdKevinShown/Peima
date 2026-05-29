import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import { computeShortlistFingerprint } from "../src/modules/ai-simulation-v1/shortlist-contract-binding";
import { PreviewPoolService } from "../src/modules/preview-pool/preview-pool.service";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../src/modules/preview-pool/preview-pool-shortlist-contract.v0";
import { PostPoolDeepScreenOrchestratorService } from "../src/modules/post-pool-deep-screen/post-pool-deep-screen-orchestrator.service";
import { PrescreenV0Service } from "../src/modules/prescreen-v0/prescreen-v0.service";
import { PRESCREEN_V0_SCHEMA } from "../src/modules/prescreen-v0/prescreen-v0.types";

function mockProfile(userId: string, dims = 0.8, confidence = 0.9) {
  return {
    userId,
    attachmentStyle: dims,
    emotionalExpression: dims,
    communicationStyle: dims,
    conflictHandling: dims,
    loveLanguage: dims,
    securityNeed: dims,
    controlNeed: dims,
    independence: dims,
    loyaltyView: dims,
    jealousyTendency: dims,
    moneyAttitude: dims,
    careerPriority: dims,
    lifePace: dims,
    socialNeed: dims,
    emotionalStability: dims,
    sexualValues: dims,
    familyView: dims,
    marriageExpectation: dims,
    childrenIntent: dims,
    riskPreference: dims,
    confidence,
  };
}

describe("PostPoolDeepScreenOrchestratorService", () => {
  it("runs dimension batch then prescreen; hint excludes demote", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pool1",
          userId: "v1",
          items: [
            { candidateUserId: "c1", rankInPool: 1 },
            { candidateUserId: "c2", rankInPool: 2 },
          ],
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockImplementation(({ where: { userId } }: { where: { userId: string } }) => {
          if (userId === "v1") {
            return {
              userId: "v1",
              attachmentStyle: 0.8,
              emotionalExpression: 0.8,
              communicationStyle: 0.8,
              conflictHandling: 0.8,
              loveLanguage: 0.8,
              securityNeed: 0.8,
              controlNeed: 0.8,
              independence: 0.8,
              loyaltyView: 0.8,
              jealousyTendency: 0.8,
              moneyAttitude: 0.8,
              careerPriority: 0.8,
              lifePace: 0.8,
              socialNeed: 0.8,
              emotionalStability: 0.8,
              sexualValues: 0.8,
              familyView: 0.8,
              marriageExpectation: 0.8,
              childrenIntent: 0.8,
              riskPreference: 0.8,
              confidence: 0.9,
            };
          }
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "c1",
            attachmentStyle: 0.8,
            emotionalExpression: 0.8,
            communicationStyle: 0.8,
            conflictHandling: 0.8,
            loveLanguage: 0.8,
            securityNeed: 0.8,
            controlNeed: 0.8,
            independence: 0.8,
            loyaltyView: 0.8,
            jealousyTendency: 0.8,
            moneyAttitude: 0.8,
            careerPriority: 0.8,
            lifePace: 0.8,
            socialNeed: 0.8,
            emotionalStability: 0.8,
            sexualValues: 0.8,
            familyView: 0.8,
            marriageExpectation: 0.8,
            childrenIntent: 0.8,
            riskPreference: 0.8,
            confidence: 0.9,
          },
          {
            userId: "c2",
            attachmentStyle: 0.1,
            emotionalExpression: 0.1,
            communicationStyle: 0.1,
            conflictHandling: 0.1,
            loveLanguage: 0.1,
            securityNeed: 0.1,
            controlNeed: 0.1,
            independence: 0.1,
            loyaltyView: 0.1,
            jealousyTendency: 0.1,
            moneyAttitude: 0.1,
            careerPriority: 0.1,
            lifePace: 0.1,
            socialNeed: 0.1,
            emotionalStability: 0.1,
            sexualValues: 0.1,
            familyView: 0.1,
            marriageExpectation: 0.1,
            childrenIntent: 0.1,
            riskPreference: 0.1,
            confidence: 0.5,
          },
        ]),
      },
    };

    const prescreenBatch = jest.fn().mockImplementation(async (dto: { candidateUserIds: string[] }) => ({
      schemaVersion: PRESCREEN_V0_SCHEMA,
      viewerUserId: "v1",
      purpose: "shadow",
      results: dto.candidateUserIds.map((id) =>
        id === "c1"
          ? {
              candidateUserId: "c1",
              bucket: "promote" as const,
              prescreenScore: 0.9,
              reasonCodes: ["static_compat_high" as const],
              debug: {
                reviewStaticScore: 80,
                staticTier: "up" as const,
                verdict: "worth_exploring" as const,
                verdictTier: "up" as const,
                bandB: 0.5,
              },
            }
          : {
              candidateUserId: id,
              bucket: "demote" as const,
              prescreenScore: 0.2,
              reasonCodes: ["static_compat_low" as const],
              debug: {
                reviewStaticScore: 20,
                staticTier: "down" as const,
                verdict: "pause" as const,
                verdictTier: "down" as const,
                bandB: 0.2,
              },
            },
      ),
      debug: { ruleVersion: "prescreen_rule_v0", droppedCandidates: [] },
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        PostPoolDeepScreenOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: PrescreenV0Service, useValue: { prescreenBatch: prescreenBatch } },
        { provide: PreviewPoolService, useValue: { buildShortlistContractV0ForPool: jest.fn() } },
        {
          provide: AiSimulationV1Service,
          useValue: {
            enqueue: jest.fn(),
            requestRunJobAsync: jest.fn().mockResolvedValue({
              ok: true,
              jobId: "sim-job",
              jobStatus: "queued",
              started: false,
              reason: "enqueued_for_worker",
            }),
          },
        },
      ],
    }).compile();

    const orch = moduleRef.get(PostPoolDeepScreenOrchestratorService);
    const out = await orch.runShadow({ viewerUserId: "v1", poolId: "pool1" });

    expect(out.shadow).toBe(true);
    expect(out.dimensionMatchSummary.rows).toHaveLength(2);
    expect(prescreenBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerUserId: "v1",
        candidateUserIds: ["c1"],
        purpose: "shadow",
      }),
    );
    const c2Row = out.dimensionMatchSummary.rows.find((r) => r.candidateUserId === "c2");
    expect(c2Row?.dimensionHardFail).toBe(true);
    expect(out.simulationQueueHint.map((h) => h.candidateUserId)).toEqual(["c1"]);
    expect(out.simulationQueueActual).toEqual([]);
    expect(out.prescreen?.results).toHaveLength(1);
  });

  it("skips prescreen when all dimension-hard-fail", async () => {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pool1",
          userId: "v1",
          items: [{ candidateUserId: "c-miss", rankInPool: 1 }],
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({
          userId: "v1",
          attachmentStyle: 0.8,
          emotionalExpression: 0.8,
          communicationStyle: 0.8,
          conflictHandling: 0.8,
          loveLanguage: 0.8,
          securityNeed: 0.8,
          controlNeed: 0.8,
          independence: 0.8,
          loyaltyView: 0.8,
          jealousyTendency: 0.8,
          moneyAttitude: 0.8,
          careerPriority: 0.8,
          lifePace: 0.8,
          socialNeed: 0.8,
          emotionalStability: 0.8,
          sexualValues: 0.8,
          familyView: 0.8,
          marriageExpectation: 0.8,
          childrenIntent: 0.8,
          riskPreference: 0.8,
          confidence: 0.9,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const prescreenBatch = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PostPoolDeepScreenOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: PrescreenV0Service, useValue: { prescreenBatch: prescreenBatch } },
        { provide: PreviewPoolService, useValue: { buildShortlistContractV0ForPool: jest.fn() } },
        {
          provide: AiSimulationV1Service,
          useValue: {
            enqueue: jest.fn(),
            requestRunJobAsync: jest.fn().mockResolvedValue({
              ok: true,
              jobId: "sim-job",
              jobStatus: "queued",
              started: false,
              reason: "enqueued_for_worker",
            }),
          },
        },
      ],
    }).compile();

    const orch = moduleRef.get(PostPoolDeepScreenOrchestratorService);
    const out = await orch.runShadow({ viewerUserId: "v1", poolId: "pool1" });

    expect(prescreenBatch).not.toHaveBeenCalled();
    expect(out.prescreen).toBeNull();
    expect(out.debug.prescreenSkippedReason).toBe("no_candidates_passed_dimension");
    expect(out.simulationQueueHint).toEqual([]);
  });

  /**
   * Phase C v0 acceptance anchor: pool can hold 6+ candidates for shadow/prescreen,
   * but MVP AI enqueue must receive only shortlistContract 2–3 ids + matching shortlistBinding
   * (never the full shadow simulationQueueHint length).
   */
  it("runOrchestrationMvp (mvp): enqueue receives shortlist-only hint (2) when pool has 6 items", async () => {
    const sixItems = ["c1", "c2", "c3", "c4", "c5", "c6"].map((candidateUserId, i) => ({
      candidateUserId,
      rankInPool: i + 1,
    }));

    const poolRow = { id: "pool1", userId: "v1", items: sixItems };

    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue(poolRow),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(mockProfile("v1")),
        findMany: jest.fn().mockImplementation(({ where: { userId: { in: ids } } }: { where: { userId: { in: string[] } } }) =>
          (ids as string[]).map((id) => mockProfile(id)),
        ),
      },
    };

    const prescreenBatch = jest.fn().mockImplementation(
      async (dto: { candidateUserIds: string[]; purpose: string }) => ({
        schemaVersion: PRESCREEN_V0_SCHEMA,
        viewerUserId: "v1",
        purpose: dto.purpose,
        results: dto.candidateUserIds.map((id) => ({
          candidateUserId: id,
          bucket: "promote" as const,
          prescreenScore: 0.9,
          reasonCodes: ["static_compat_high" as const],
          debug: {
            reviewStaticScore: 80,
            staticTier: "up" as const,
            verdict: "worth_exploring" as const,
            verdictTier: "up" as const,
            bandB: 0.5,
          },
        })),
        debug: { ruleVersion: "prescreen_rule_v0", droppedCandidates: [] },
      }),
    );

    const buildShortlistContractV0ForPool = jest.fn().mockResolvedValue({
      schemaVersion: PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION,
      viewerUserId: "v1",
      poolId: "pool1",
      shortlist: { size: 2, candidateUserIds: ["c1", "c2"] },
      staticEvidence: {},
      exclusionReport: [],
    });

    const enqueue = jest.fn().mockResolvedValue({
      simulationJobId: "sim-job-anchor",
      acceptedCandidateCount: 2,
      simulationQueueActual: ["c1", "c2"],
    });
    const requestRunJobAsync = jest.fn().mockResolvedValue({
      ok: true,
      jobId: "sim-job-anchor",
      jobStatus: "queued",
      started: false,
      reason: "enqueued_for_worker",
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        PostPoolDeepScreenOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: PrescreenV0Service, useValue: { prescreenBatch } },
        { provide: PreviewPoolService, useValue: { buildShortlistContractV0ForPool } },
        { provide: AiSimulationV1Service, useValue: { enqueue, requestRunJobAsync } },
      ],
    }).compile();

    const orch = moduleRef.get(PostPoolDeepScreenOrchestratorService);
    const out = await orch.runOrchestrationMvp({
      viewerUserId: "v1",
      poolId: "pool1",
      runMode: "mvp",
    });

    expect(prescreenBatch).toHaveBeenCalled();
    const shadowCall = prescreenBatch.mock.calls.find((c) => (c[0].candidateUserIds as string[]).length === 6);
    expect(shadowCall?.[0].candidateUserIds).toHaveLength(6);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(requestRunJobAsync).toHaveBeenCalledWith("sim-job-anchor", "v1");
    expect(enqueue.mock.calls[0][1]).toBe(AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE);
    const enqueueArg = enqueue.mock.calls[0][0] as {
      hintSnapshot: { candidateUserId: string }[];
      shortlistBinding: {
        previewPoolId: string;
        shortlistSchemaVersion: string;
        shortlistCandidateUserIds: string[];
        shortlistFingerprint: string;
      };
    };

    expect(enqueueArg.hintSnapshot).toHaveLength(2);
    expect(enqueueArg.hintSnapshot.map((e) => e.candidateUserId)).toEqual(["c1", "c2"]);
    expect(enqueueArg.shortlistBinding.previewPoolId).toBe("pool1");
    expect(enqueueArg.shortlistBinding.shortlistSchemaVersion).toBe(
      PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION,
    );
    expect(enqueueArg.shortlistBinding.shortlistCandidateUserIds).toEqual(["c1", "c2"]);
    expect(enqueueArg.shortlistBinding.shortlistFingerprint).toBe(
      computeShortlistFingerprint(["c1", "c2"]),
    );

    expect(out.simulationQueueHint).toHaveLength(2);
    expect(out.simulationQueueActual).toEqual(["c1", "c2"]);
    expect(out.stages.aiSimulation.simulationJobId).toBe("sim-job-anchor");
    expect(out.stages.aiSimulation.runTriggered).toBe(true);
  });
});
