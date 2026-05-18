import * as p76DbAdapter from "../src/modules/onboarding/vision/p76-photovisual-first-pool-db-adapter";
import {
  buildPhotoVisualPoolInputV1FromLoadedContext,
  buildPhotoVisualPoolShadowAuditReport,
  runPhotoVisualPoolShadowAuditFromDb,
  P76_PREFERRED_VISION_SOURCE_VERSION,
  type P76LoadedPhotoVisualPoolAuditContext,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool-db-adapter";
import { buildPhotoFirstMutualMatchingShadowV1 } from "../src/modules/onboarding/vision/p76-photovisual-first-pool-shadow";

function mockLoadedContext(
  overrides: Partial<P76LoadedPhotoVisualPoolAuditContext> = {},
): P76LoadedPhotoVisualPoolAuditContext {
  return {
    viewerUserId: "viewer-1",
    viewerStyleTags: ["tag-a"],
    viewerVision: {
      visionStatus: "ok",
      photoVisualTags: ["tag-x"],
      sourceVersion: P76_PREFERRED_VISION_SOURCE_VERSION,
    },
    viewerGenderNorm: "male",
    gatePref: null,
    candidates: [
      {
        candidateUserId: "c-high",
        candidateStyleTags: ["tag-a", "tag-b"],
        firstImageReviewStatus: "not_required",
        firstImageDetectionStatus: "passed",
        gates: {
          isSelf: false,
          genderGatePassed: true,
          preferenceGatePassed: true,
          reviewUsable: true,
          detectionUsable: true,
          userBlocked: false,
          missingProfile: false,
        },
        preferenceFields: {
          age: 25,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "恋爱",
        },
      },
      {
        candidateUserId: "c-blocked",
        candidateStyleTags: ["tag-a"],
        firstImageReviewStatus: "rejected",
        firstImageDetectionStatus: "passed",
        gates: {
          isSelf: false,
          genderGatePassed: true,
          preferenceGatePassed: true,
          reviewUsable: false,
          detectionUsable: false,
          userBlocked: false,
          missingProfile: false,
        },
        preferenceFields: {
          age: 25,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "恋爱",
        },
      },
    ],
    candidateImagesByUserId: new Map([
      [
        "c-high",
        [
          {
            id: "img-h",
            userId: "c-high",
            createdAt: new Date(),
            detectionScoreJson: {
              vision: {
                schemaVersion: "onboarding-vision-v1",
                sourceVersion: P76_PREFERRED_VISION_SOURCE_VERSION,
                photoVisualTaxonomyVersion: "p7.5-v1",
                provider: "zhipu",
                generatedAt: "2026-01-01T00:00:00.000Z",
                visionStatus: "ok",
                fallbackUsed: false,
                photoVisualTags: ["tag-a", "tag-b"],
                confidence: 0.8,
              },
            },
            detectionStatus: "passed",
            reviewStatus: "not_required",
          },
        ],
      ],
      [
        "c-blocked",
        [
          {
            id: "img-b",
            userId: "c-blocked",
            createdAt: new Date(),
            detectionScoreJson: {
              vision: {
                schemaVersion: "onboarding-vision-v1",
                sourceVersion: P76_PREFERRED_VISION_SOURCE_VERSION,
                photoVisualTaxonomyVersion: "p7.5-v1",
                provider: "zhipu",
                generatedAt: "2026-01-01T00:00:00.000Z",
                visionStatus: "ok",
                fallbackUsed: false,
                photoVisualTags: ["tag-a"],
                confidence: 0.5,
              },
            },
            detectionStatus: "passed",
            reviewStatus: "not_required",
          },
        ],
      ],
    ]),
    viewerImages: [],
    ...overrides,
  };
}

describe("p76 photovisual pool audit runner", () => {
  it("builds report from mock loaded context via pure builder", () => {
    const loaded = mockLoadedContext();
    const cli = {
      viewerUserId: "viewer-1",
      sourcePoolType: "onboarding_gated_cohort" as const,
      limit: 20,
      selectionLimit: 6,
      dryRun: true as const,
    };

    const poolInput = buildPhotoVisualPoolInputV1FromLoadedContext(loaded, {
      sourcePoolType: cli.sourcePoolType,
      poolId: "pool-test",
      generatedAt: "2026-05-16T00:00:00.000Z",
      selectionLimit: cli.selectionLimit,
    });

    const shadow = buildPhotoFirstMutualMatchingShadowV1(poolInput);
    const report = buildPhotoVisualPoolShadowAuditReport({
      cli,
      scannedCandidates: loaded.candidates.length,
      shadow,
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    expect(report.schemaVersion).toBe("p7.6-r3b-photovisual-pool-shadow-audit-v1");
    expect(report.applied).toBe(false);
    expect(report.scannedCandidates).toBe(2);
    expect(report.selectedCandidateIds).toEqual(["c-high"]);
    expect(report.ineligibleReasonDistribution.REVIEW_BLOCKED).toBe(1);
    expect(report.shadow.finalShadow.appliedToWorkerRanking).toBe(false);
  });

  it("viewer vision missing → selectedCandidateIds empty", () => {
    const loaded = mockLoadedContext({
      viewerVision: null,
      candidates: [],
    });
    const poolInput = buildPhotoVisualPoolInputV1FromLoadedContext(loaded, {
      sourcePoolType: "onboarding_gated_cohort",
      poolId: "p",
      generatedAt: "2026-05-16T00:00:00.000Z",
      selectionLimit: 6,
    });
    const shadow = buildPhotoFirstMutualMatchingShadowV1(poolInput);
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toEqual([]);
  });

  it("runPhotoVisualPoolShadowAuditFromDb does not call prisma writes", async () => {
    const loaded = mockLoadedContext({ candidates: [] });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "viewer-1", gender: "male" }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({ styleTags: ["tag-a"] }),
      },
      userImage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      onboardingPhotoPreviewPool: {
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
      },
      matchResult: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    jest
      .spyOn(p76DbAdapter, "loadPhotoVisualPoolAuditContext")
      .mockResolvedValue(loaded);

    const report = await runPhotoVisualPoolShadowAuditFromDb(prisma as never, {
      viewerUserId: "viewer-1",
      sourcePoolType: "onboarding_gated_cohort",
      limit: 20,
      selectionLimit: 6,
      dryRun: true,
    });

    expect(report.scannedCandidates).toBe(0);
    expect(report.selectedCandidateIds).toEqual([]);
    expect(prisma.onboardingPhotoPreviewPool.create).not.toHaveBeenCalled();
    expect(prisma.onboardingPhotoPreviewPool.update).not.toHaveBeenCalled();
    expect(prisma.matchResult.create).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
