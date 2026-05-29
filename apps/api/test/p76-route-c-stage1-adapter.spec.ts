import type { PrismaClient } from "@peima/database";
import {
  P76_PREFERRED_VISION_SOURCE_VERSION,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool-db-adapter";
import {
  assertRouteCStage1AdapterPrivacySafe,
  buildRouteCStage1AdapterReport,
  evaluateRouteCCandidatePair,
  isSyntheticRouteCPoolId,
  runRouteCStage1AdapterAuditFromDb,
} from "../src/modules/onboarding/vision/p76-route-c-stage1-adapter";
import {
  P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION,
  P76_ROUTE_C_SOURCE_POOL_TYPE,
  P76_ROUTE_C_STAGE1_ADAPTER_SCHEMA_VERSION,
} from "../src/modules/onboarding/vision/p76-route-c-stage1-adapter.types";
import { hasMeaningfulRouteCCore20D } from "../src/modules/onboarding/vision/p76-route-c-stage1-profile";

function visionJson(tags: string[]) {
  return {
    vision: {
      schemaVersion: "onboarding-vision-v1",
      sourceVersion: P76_PREFERRED_VISION_SOURCE_VERSION,
      photoVisualTaxonomyVersion: "p7.5-v1",
      provider: "cloud",
      generatedAt: "2026-01-01T00:00:00.000Z",
      visionStatus: "ok",
      fallbackUsed: false,
      photoVisualTags: tags,
      qualityTags: ["清晰"],
      sceneTags: ["室内日常"],
      confidence: 0.7,
    },
  };
}

function passedImage(tags: string[]) {
  return {
    id: "img-1",
    userId: "cand-1",
    createdAt: new Date(),
    detectionScoreJson: visionJson(tags),
    detectionStatus: "passed",
    reviewStatus: "not_required",
  };
}

function coreProfileRow() {
  return {
    relationshipPace: 0.5,
    emotionalStability: 0.6,
    communicationStyle: 0.7,
    conflictHandling: 0.5,
    lifePace: 0.6,
    socialNeed: 0.5,
  };
}

function cliInput(viewerUserId = "viewer-1") {
  return {
    viewerUserId,
    sourcePoolType: P76_ROUTE_C_SOURCE_POOL_TYPE,
    poolSourceVersion: P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION,
    selectionLimit: 6,
    dryRun: true as const,
  };
}

describe("p76 route c stage1 adapter", () => {
  it("isSyntheticRouteCPoolId detects dev-p76 pools", () => {
    expect(isSyntheticRouteCPoolId("dev-p76-r7c5-pool-x")).toBe(true);
    expect(isSyntheticRouteCPoolId("staging-p76-r7j4-pool-x")).toBe(false);
  });

  it("hasMeaningfulRouteCCore20D requires 4+ core dims", () => {
    expect(hasMeaningfulRouteCCore20D(coreProfileRow())).toBe(true);
    expect(
      hasMeaningfulRouteCCore20D({
        relationshipPace: 0.5,
        emotionalStability: 0.6,
      }),
    ).toBe(false);
  });

  it("self candidate → SELF ineligible", () => {
    const pair = evaluateRouteCCandidatePair({
      viewerUserId: "viewer-1",
      candidateUserId: "viewer-1",
      rankInPool: 1,
      images: [passedImage(["tag-a"])],
      hasPreference: true,
      nonNull20DCount: 6,
      hasTwentyDProfile: true,
    });
    expect(pair.eligible).toBe(false);
    expect(pair.ineligibleReasons).toContain("SELF");
  });

  it("missing vision → ineligible", () => {
    const pair = evaluateRouteCCandidatePair({
      viewerUserId: "viewer-1",
      candidateUserId: "cand-1",
      rankInPool: 1,
      images: [
        {
          id: "img-1",
          userId: "cand-1",
          createdAt: new Date(),
          detectionScoreJson: {},
          detectionStatus: "passed",
          reviewStatus: "not_required",
        },
      ],
      hasPreference: true,
      nonNull20DCount: 6,
      hasTwentyDProfile: true,
    });
    expect(pair.eligible).toBe(false);
    expect(pair.ineligibleReasons).toContain("VISION_NOT_OK");
  });

  it("empty photoVisualTags → ineligible", () => {
    const pair = evaluateRouteCCandidatePair({
      viewerUserId: "viewer-1",
      candidateUserId: "cand-1",
      rankInPool: 1,
      images: [passedImage([])],
      hasPreference: true,
      nonNull20DCount: 6,
      hasTwentyDProfile: true,
    });
    expect(pair.eligible).toBe(false);
    expect(
      pair.ineligibleReasons.some((r) =>
        ["EMPTY_PHOTO_VISUAL_TAGS", "VISION_NOT_OK"].includes(r),
      ),
    ).toBe(true);
  });

  it("missing 20D → PROFILE_MISSING", () => {
    const pair = evaluateRouteCCandidatePair({
      viewerUserId: "viewer-1",
      candidateUserId: "cand-1",
      rankInPool: 1,
      images: [passedImage(["tag-a"])],
      hasPreference: true,
      nonNull20DCount: 0,
      hasTwentyDProfile: false,
    });
    expect(pair.ineligibleReasons).toContain("PROFILE_MISSING");
  });

  it("missing preference → PREFERENCE_MISSING", () => {
    const pair = evaluateRouteCCandidatePair({
      viewerUserId: "viewer-1",
      candidateUserId: "cand-1",
      rankInPool: 1,
      images: [passedImage(["tag-a"])],
      hasPreference: false,
      nonNull20DCount: 6,
      hasTwentyDProfile: true,
    });
    expect(pair.ineligibleReasons).toContain("PREFERENCE_MISSING");
  });

  it("buildRouteCStage1AdapterReport selects eligible by rank up to limit", () => {
    const report = buildRouteCStage1AdapterReport({
      cli: { ...cliInput(), selectionLimit: 2 },
      sourcePoolId: "pool-1",
      generatedAt: "2026-05-16T00:00:00.000Z",
      pairs: [
        {
          candidateUserId: "c1",
          rankInPool: 1,
          eligible: true,
          ineligibleReasons: [],
          hasVision: true,
          photoVisualTagsCount: 2,
          hasTwentyDProfile: true,
          nonNull20DCount: 6,
          hasPreference: true,
        },
        {
          candidateUserId: "c2",
          rankInPool: 2,
          eligible: false,
          ineligibleReasons: ["VISION_NOT_OK"],
          hasVision: false,
          photoVisualTagsCount: 0,
          hasTwentyDProfile: true,
          nonNull20DCount: 6,
          hasPreference: true,
        },
        {
          candidateUserId: "c3",
          rankInPool: 3,
          eligible: true,
          ineligibleReasons: [],
          hasVision: true,
          photoVisualTagsCount: 1,
          hasTwentyDProfile: true,
          nonNull20DCount: 6,
          hasPreference: true,
        },
      ],
    });
    expect(report.selectedCandidateIds).toEqual(["c1", "c3"]);
    expect(report.applied).toBe(false);
    expect(report.schemaVersion).toBe(P76_ROUTE_C_STAGE1_ADAPTER_SCHEMA_VERSION);
  });

  it("privacy safe report", () => {
    const report = buildRouteCStage1AdapterReport({
      cli: cliInput(),
      sourcePoolId: "staging-p76-r7j4-pool-x",
      generatedAt: "2026-05-16T00:00:00.000Z",
      pairs: [],
    });
    expect(() => assertRouteCStage1AdapterPrivacySafe(report)).not.toThrow();
    expect(() =>
      assertRouteCStage1AdapterPrivacySafe({
        ...report,
        imageUrl: "http://x",
      }),
    ).toThrow(/sensitive field/);
  });

  it("runRouteCStage1AdapterAuditFromDb pool missing → empty selection", async () => {
    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const report = await runRouteCStage1AdapterAuditFromDb(prisma, cliInput());
    expect(report.selectedCandidateIds).toEqual([]);
    expect(report.sourcePoolId).toBeNull();
    expect(report.applied).toBe(false);
  });

  it("runRouteCStage1AdapterAuditFromDb sourceVersion mismatch → empty", async () => {
    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const report = await runRouteCStage1AdapterAuditFromDb(prisma, {
      ...cliInput(),
      poolSourceVersion: "wrong-version",
    });
    expect(report.selectedCandidateIds).toEqual([]);
  });

  it("runRouteCStage1AdapterAuditFromDb synthetic pool → empty", async () => {
    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: "dev-p76-r7c5-pool-x" }),
      },
    } as unknown as PrismaClient;

    const report = await runRouteCStage1AdapterAuditFromDb(prisma, cliInput());
    expect(report.selectedCandidateIds).toEqual([]);
    expect(report.sourcePoolId).toBeNull();
  });

  it("runRouteCStage1AdapterAuditFromDb 6 eligible → selectedCandidateIds.length=6", async () => {
    const viewerUserId = "viewer-1";
    const poolId = "staging-p76-r7j4-pool-test";
    const items = Array.from({ length: 6 }, (_, i) => ({
      candidateUserId: `cand-${i + 1}`,
      rankInPool: i + 1,
    }));

    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: poolId }),
      },
      onboardingPhotoPreviewPoolItem: {
        findMany: jest.fn().mockResolvedValue(items),
      },
      userImage: {
        findMany: jest.fn().mockImplementation(async () =>
          items.map((it) => ({
            ...passedImage(["清爽自然"]),
            userId: it.candidateUserId,
            id: `img-${it.candidateUserId}`,
          })),
        ),
      },
      userProfile: {
        findMany: jest.fn().mockImplementation(async () =>
          items.map((it) => ({
            userId: it.candidateUserId,
            ...coreProfileRow(),
          })),
        ),
      },
      userPreference: {
        findMany: jest.fn().mockImplementation(async () =>
          items.map((it) => ({ userId: it.candidateUserId })),
        ),
      },
    } as unknown as PrismaClient;

    const report = await runRouteCStage1AdapterAuditFromDb(
      prisma,
      cliInput(viewerUserId),
    );
    expect(report.selectedCandidateIds).toHaveLength(6);
    expect(report.eligibleCandidates).toBe(6);
    expect(report.sourcePoolId).toBe(poolId);
    expect(report.applied).toBe(false);
    expect(() => assertRouteCStage1AdapterPrivacySafe(report)).not.toThrow();
  });

  it("self in pool items → excluded from selection", async () => {
    const viewerUserId = "viewer-1";
    const poolId = "staging-p76-r7j4-pool-test";
    const items = [
      { candidateUserId: viewerUserId, rankInPool: 1 },
      { candidateUserId: "cand-1", rankInPool: 2 },
    ];

    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue({ id: poolId }),
      },
      onboardingPhotoPreviewPoolItem: {
        findMany: jest.fn().mockResolvedValue(items),
      },
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          { ...passedImage(["t"]), userId: "cand-1", id: "img-c1" },
        ]),
      },
      userProfile: {
        findMany: jest.fn().mockResolvedValue([
          { userId: "cand-1", ...coreProfileRow() },
        ]),
      },
      userPreference: {
        findMany: jest.fn().mockResolvedValue([{ userId: "cand-1" }]),
      },
    } as unknown as PrismaClient;

    const report = await runRouteCStage1AdapterAuditFromDb(
      prisma,
      cliInput(viewerUserId),
    );
    expect(report.pairs.some((p) => p.ineligibleReasons.includes("SELF"))).toBe(
      true,
    );
    expect(report.selectedCandidateIds).toEqual(["cand-1"]);
  });
});
