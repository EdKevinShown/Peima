import { Test } from "@nestjs/testing";
import { PostPoolDeepScreenOrchestratorService } from "../src/modules/post-pool-deep-screen/post-pool-deep-screen-orchestrator.service";
import { PrescreenV0Service } from "../src/modules/prescreen-v0/prescreen-v0.service";
import { PRESCREEN_V0_SCHEMA } from "../src/modules/prescreen-v0/prescreen-v0.types";
import { PrismaService } from "../src/common/prisma/prisma.service";

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
      ],
    }).compile();

    const orch = moduleRef.get(PostPoolDeepScreenOrchestratorService);
    const out = await orch.runShadow({ viewerUserId: "v1", poolId: "pool1" });

    expect(prescreenBatch).not.toHaveBeenCalled();
    expect(out.prescreen).toBeNull();
    expect(out.debug.prescreenSkippedReason).toBe("no_candidates_passed_dimension");
    expect(out.simulationQueueHint).toEqual([]);
  });
});
