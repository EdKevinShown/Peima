import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  OnboardingPhotoPreviewPoolService,
  buildSixNonSelfPreviewSlots,
  isEligiblePreviewCandidate,
} from "../src/modules/onboarding/onboarding-photo-preview-pool.service";
import { VisualRankingShadowService } from "../src/modules/onboarding/vision/visual-ranking-shadow.service";
import { previewPoolRowDisplaySourceKey } from "../src/modules/onboarding/onboarding-photo-preview-display-image-key";

/** P7.5-r5-c1: generate() calls `buildForGenerate` before pool create. */
function shadowServiceMock(overrides?: {
  computeShadow?: jest.Mock;
  buildForGenerate?: jest.Mock;
}) {
  const disabled = { computed: false as const, reason: "shadow_disabled" as const };
  return {
    buildForGenerate:
      overrides?.buildForGenerate ??
      jest.fn().mockResolvedValue(disabled),
    computeShadow:
      overrides?.computeShadow ?? jest.fn().mockResolvedValue(disabled),
  };
}

function candidateRow(
  id: string,
  iso: string,
  styleTags: string[],
  /** Default opposite to a male viewer preview path. */
  gender = "female",
  firstImageUrl: string | null = `https://cdn.example.test/u/${id}-r4h-u${id}--${id}-stem--.jpg`,
) {
  return {
    id,
    createdAt: new Date(iso),
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
    gender,
    images: [{ styleTags, imageUrl: firstImageUrl, reviewStatus: "approved" }],
  };
}

function toGated(row: ReturnType<typeof candidateRow>) {
  const im = row.images[0] as {
    styleTags: string[];
    imageUrl?: string | null;
    reviewStatus?: string;
  };
  return {
    id: row.id,
    createdAt: row.createdAt,
    age: row.age,
    city: row.city,
    height: row.height,
    education: row.education,
    occupation: row.occupation,
    relationshipGoal: row.relationshipGoal,
    firstImageStyleTags: im?.styleTags ?? [],
    firstImageUrl: im?.imageUrl ?? null,
    firstImageReviewStatus: im?.reviewStatus ?? "approved",
    gender: row.gender ?? "",
  };
}

/** Prisma `user.findMany`: collect (batch, []) then post-slot gender verify (`id.in`). */
function mockUserFindManyForGenerate(
  batch: ReturnType<typeof candidateRow>[],
): jest.Mock {
  let collectCall = 0;
  return jest.fn().mockImplementation((args: { where?: { id?: { in?: string[] } } }) => {
    const ids = args?.where?.id?.in;
    if (Array.isArray(ids)) {
      return Promise.resolve(
        ids.map((id) => ({
          id,
          gender: batch.find((r) => r.id === id)?.gender ?? "female",
        })),
      );
    }
    collectCall += 1;
    if (collectCall === 1) return Promise.resolve(batch);
    return Promise.resolve([]);
  });
}

/** Mirrors Prisma `findFirst` where used in `toViewerBundle` (AND: userId eq, userId not viewer). */
function mockUserImageFindFirst(
  resolver: (candidateUserId: string, poolViewerId: string) => { imageUrl: string } | null,
) {
  return jest.fn().mockImplementation(
    (args: { where?: { AND?: Array<{ userId?: unknown }> } }) => {
      const and = args.where?.AND ?? [];
      const eq = and.find((c) => typeof c.userId === "string") as
        | { userId: string }
        | undefined;
      const notClause = and.find(
        (c) =>
          c.userId !== undefined &&
          typeof c.userId === "object" &&
          c.userId !== null &&
          "not" in (c.userId as object),
      ) as { userId: { not: string } } | undefined;
      const candidateId = eq?.userId;
      const viewerId = notClause?.userId?.not;
      if (!candidateId || !viewerId) return Promise.resolve(null);
      return Promise.resolve(resolver(candidateId, viewerId));
    },
  );
}

describe("OnboardingPhotoPreviewPoolService (P7.2)", () => {
  it("generate creates 3 aesthetic_fit/clear, 2 style_similar/blurred, 1 reflow/hidden; never touches previewPool", async () => {
    const six = [
      candidateRow("a", "2020-01-01", ["清爽自然"]),
      candidateRow("b", "2020-02-01", ["清爽自然", "生活感"]),
      candidateRow("c", "2020-03-01", ["生活感"]),
      candidateRow("d", "2020-04-01", ["成熟稳重"]),
      candidateRow("e", "2020-05-01", ["运动阳光"]),
      candidateRow("f", "2019-01-01", ["有个性"]),
    ];

    const previewPoolUpdateMany = jest.fn();
    const onboardingArchive = jest.fn().mockResolvedValue({ count: 0 });
    const createPool = jest.fn().mockResolvedValue({
      id: "pool-1",
      userId: "viewer-1",
      status: "active",
      sourceVersion: "onboarding-photo-preview-v1",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });

    const prisma: Record<string, unknown> = {
      previewPool: { updateMany: previewPoolUpdateMany },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          gender: "male",
        }),
        findMany: jest.fn(),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn(),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          userId: "viewer-1",
          minAge: null,
          maxAge: null,
          preferredCities: [],
          minHeight: null,
          maxHeight: null,
          educationPreferences: [],
          occupationPreferences: [],
          relationshipGoalPreferences: [],
          styleTags: ["清爽自然", "生活感"],
        }),
      },
      onboardingPhotoPreviewPool: {
        updateMany: onboardingArchive,
        create: createPool,
      },
    };

    (prisma.user as { findMany: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValueOnce(six)
      .mockResolvedValueOnce(six.map((r) => ({ id: r.id, gender: r.gender })));

    createPool.mockImplementation(async (args: { data: { items: { create: unknown[] } } }) => {
      const creates = args.data.items.create as {
        tier: string;
        displayMode: string;
        rankInPool: number;
        candidateUserId: string;
      }[];
      return {
        id: "pool-1",
        userId: "viewer-1",
        status: "active",
        sourceVersion: "onboarding-photo-preview-v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        items: creates.map((c, i) => ({
          id: `item-${i}`,
          candidateUserId: c.candidateUserId,
          tier: c.tier,
          displayMode: c.displayMode,
          rankInPool: c.rankInPool,
          score: 0.5,
          reasonTags: ["onboarding-photo-preview-v1"],
        })),
      };
    });

    (prisma.userImage as { findFirst: jest.Mock }).findFirst =
      mockUserImageFindFirst((cid) =>
        cid === "a" ? { imageUrl: "https://x/a.jpg" } : null,
      );

    const buildForGenerate = jest
      .fn()
      .mockResolvedValue({ computed: false, reason: "shadow_disabled" });
    const computeShadow = jest
      .fn()
      .mockResolvedValue({ computed: false, reason: "shadow_disabled" });
    const moduleRefWithShadow = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: shadowServiceMock({ buildForGenerate, computeShadow }),
        },
      ],
    }).compile();
    const svcWithShadow = moduleRefWithShadow.get(OnboardingPhotoPreviewPoolService);

    await svcWithShadow.generate("viewer-1");

    expect(buildForGenerate).toHaveBeenCalled();
    const shadowPayload = buildForGenerate.mock.calls[0]?.[0] as {
      viewerUserId: string;
      baselineItems: Array<{ candidateUserId: string }>;
      gatedCandidates: Array<{ id: string }>;
      applyDryRunContext?: {
        viewerGenderRaw: string | null;
        poolGuardRows: unknown[];
      };
    };
    expect(shadowPayload.applyDryRunContext?.poolGuardRows).toHaveLength(6);
    expect(shadowPayload.applyDryRunContext?.viewerGenderRaw).toBe("male");
    expect(
      shadowPayload.baselineItems.every((it) => it.candidateUserId !== "viewer-1"),
    ).toBe(true);
    expect(
      shadowPayload.gatedCandidates.every(
        (c) => c.id !== shadowPayload.viewerUserId,
      ),
    ).toBe(true);
    expect(previewPoolUpdateMany).not.toHaveBeenCalled();
    expect(onboardingArchive).toHaveBeenCalled();
    const createArg = createPool.mock.calls[0][0] as {
      data: { items: { create: unknown[] } };
    };
    const items = createArg.data.items.create as {
      tier: string;
      displayMode: string;
      rankInPool: number;
      candidateUserId: string;
    }[];
    expect(items).toHaveLength(6);
    expect(new Set(items.map((i) => i.candidateUserId)).size).toBe(6);
    expect(items.every((i) => i.candidateUserId !== "viewer-1")).toBe(true);
    const byTier = (t: string) => items.filter((i) => i.tier === t).map((i) => i.candidateUserId);
    expect(new Set([...byTier("aesthetic_fit"), ...byTier("style_similar"), ...byTier("reflow")]).size).toBe(
      6,
    );
    expect(items.filter((i) => i.tier === "aesthetic_fit" && i.displayMode === "clear")).toHaveLength(3);
    expect(items.filter((i) => i.tier === "style_similar" && i.displayMode === "blurred")).toHaveLength(2);
    expect(items.filter((i) => i.tier === "reflow" && i.displayMode === "hidden")).toHaveLength(1);
  });

  it("generate succeeds with fully empty match dimensions (no preference filter)", async () => {
    const six = [
      candidateRow("a", "2020-01-01", ["清爽自然"]),
      candidateRow("b", "2020-02-01", ["清爽自然", "生活感"]),
      candidateRow("c", "2020-03-01", ["生活感"]),
      candidateRow("d", "2020-04-01", ["成熟稳重"]),
      candidateRow("e", "2020-05-01", ["运动阳光"]),
      candidateRow("f", "2019-01-01", ["有个性"]),
    ];

    const prisma: Record<string, unknown> = {
      previewPool: { updateMany: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          gender: "male",
        }),
        findMany: jest
          .fn()
          .mockResolvedValueOnce(six)
          .mockResolvedValueOnce(six.map((r) => ({ id: r.id, gender: r.gender }))),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: mockUserImageFindFirst((cid) =>
          ["a", "b", "c", "d", "e", "f"].includes(cid)
            ? { imageUrl: `https://x/${cid}.jpg` }
            : null,
        ),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          userId: "viewer-1",
          minAge: null,
          maxAge: null,
          preferredCities: [],
          minHeight: null,
          maxHeight: null,
          educationPreferences: [],
          occupationPreferences: [],
          relationshipGoalPreferences: [],
          styleTags: [],
        }),
      },
      onboardingPhotoPreviewPool: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(async (args: { data: { items: { create: unknown[] } } }) => ({
          id: "pool-empty-pref",
          userId: "viewer-1",
          status: "active",
          sourceVersion: "onboarding-photo-preview-v1",
          createdAt: new Date(),
          updatedAt: new Date(),
          items: (args.data.items.create as { candidateUserId: string }[]).map(
            (c, i) => ({
              id: `item-${i}`,
              candidateUserId: c.candidateUserId,
              tier: "aesthetic_fit",
              displayMode: "clear",
              rankInPool: i + 1,
              score: 0.5,
              reasonTags: [],
            }),
          ),
        })),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: shadowServiceMock(),
        },
      ],
    }).compile();

    await expect(
      moduleRef.get(OnboardingPhotoPreviewPoolService).generate("viewer-1"),
    ).resolves.toBeDefined();
    const createArg = (prisma.onboardingPhotoPreviewPool as { create: jest.Mock }).create
      .mock.calls[0][0] as { data: { items: { create: unknown[] } } };
    expect((createArg.data.items.create as unknown[]).length).toBe(6);
  });

  it("generate succeeds when computeShadow rejects", async () => {
    const six = [
      candidateRow("a", "2020-01-01", ["清爽自然"]),
      candidateRow("b", "2020-02-01", ["生活感"]),
      candidateRow("c", "2020-03-01", ["生活感"]),
      candidateRow("d", "2020-04-01", ["成熟稳重"]),
      candidateRow("e", "2020-05-01", ["运动阳光"]),
      candidateRow("f", "2019-01-01", ["有个性"]),
    ];
    const createPool = jest.fn().mockImplementation(async (args: { data: { items: { create: unknown[] } } }) => ({
      id: "pool-2",
      userId: "viewer-1",
      status: "active",
      sourceVersion: "onboarding-photo-preview-v1",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: (args.data.items.create as {
        rankInPool: number;
        tier: string;
        displayMode: string;
        candidateUserId: string;
      }[]).map(
        (c, i) => ({
          id: `item-${i}`,
          candidateUserId: c.candidateUserId,
          tier: c.tier,
          displayMode: c.displayMode,
          rankInPool: c.rankInPool,
          score: 0.5,
          reasonTags: [],
        }),
      ),
    }));
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          gender: "male",
        }),
        findMany: jest.fn()
          .mockResolvedValueOnce(six)
          .mockResolvedValueOnce(six.map((r) => ({ id: r.id, gender: r.gender }))),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: mockUserImageFindFirst((cid) =>
          ["a", "b", "c", "d", "e", "f"].includes(cid)
            ? { imageUrl: `https://x/${cid}.jpg` }
            : null,
        ),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          styleTags: ["清爽自然"],
          preferredCities: [],
          educationPreferences: [],
          occupationPreferences: [],
          relationshipGoalPreferences: [],
        }),
      },
      onboardingPhotoPreviewPool: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: createPool,
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: shadowServiceMock({
            buildForGenerate: jest.fn().mockResolvedValue({ computed: false, reason: "shadow_disabled" }),
            computeShadow: jest.fn().mockRejectedValue(new Error("shadow failed")),
          }),
        },
      ],
    }).compile();
    const svc = moduleRef.get(OnboardingPhotoPreviewPoolService);
    await expect(svc.generate("viewer-1")).resolves.toBeDefined();
    expect(createPool).toHaveBeenCalled();
  });

  it("acknowledge rejects without 6-item active pool", async () => {
    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue({
          items: [{ id: "1" }],
        }),
      },
      user: { update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: shadowServiceMock(),
        },
      ],
    }).compile();
    const svc = moduleRef.get(OnboardingPhotoPreviewPoolService);
    await expect(svc.acknowledge("u1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("toViewerBundle omits imageUrl for hidden", async () => {
    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue({
          id: "p1",
          userId: "v1",
          status: "active",
          sourceVersion: "onboarding-photo-preview-v1",
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            {
              id: "i1",
              candidateUserId: "c1",
              tier: "reflow",
              displayMode: "hidden",
              rankInPool: 6,
              score: 0.4,
              reasonTags: [],
            },
          ],
        }),
      },
      userImage: {
        findFirst: mockUserImageFindFirst((cid) =>
          cid === "c1" ? { imageUrl: "https://secret.jpg" } : null,
        ),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: shadowServiceMock(),
        },
      ],
    }).compile();
    const svc = moduleRef.get(OnboardingPhotoPreviewPoolService);
    const bundle = await svc.findLatestActiveForViewer("v1");
    expect(bundle.items[0].imageUrl).toBeUndefined();
    expect(bundle).not.toHaveProperty("visualRankingShadow");
    expect(bundle.pool).not.toHaveProperty("visualRankingShadow");
  });

  it("generate drops viewer from gated list when findMany erroneously includes viewer user id", async () => {
    const six = [
      candidateRow("a", "2020-01-01", ["清爽自然"]),
      candidateRow("b", "2020-02-01", ["生活感"]),
      candidateRow("c", "2020-03-01", ["生活感"]),
      candidateRow("d", "2020-04-01", ["成熟稳重"]),
      candidateRow("e", "2020-05-01", ["运动阳光"]),
      candidateRow("f", "2019-01-01", ["有个性"]),
    ];
    const polluted = [candidateRow("viewer-1", "2018-01-01", ["清爽自然"]), ...six];
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          gender: "male",
        }),
        findMany: jest.fn()
          .mockResolvedValueOnce(polluted)
          .mockResolvedValueOnce(six.map((r) => ({ id: r.id, gender: r.gender }))),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: mockUserImageFindFirst(() => null),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          styleTags: ["清爽自然", "生活感"],
          preferredCities: [],
          educationPreferences: [],
          occupationPreferences: [],
          relationshipGoalPreferences: [],
          minAge: null,
          maxAge: null,
          minHeight: null,
          maxHeight: null,
        }),
      },
      onboardingPhotoPreviewPool: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(async (args: {
          data: { items: { create: { candidateUserId: string }[] } };
        }) => ({
          id: "pool-p",
          userId: "viewer-1",
          status: "active",
          sourceVersion: "onboarding-photo-preview-v1",
          createdAt: new Date(),
          updatedAt: new Date(),
          items: (args.data.items.create as { candidateUserId: string; tier: string; displayMode: string; rankInPool: number }[]).map(
            (c, i) => ({
              id: `it-${i}`,
              candidateUserId: c.candidateUserId,
              tier: c.tier,
              displayMode: c.displayMode,
              rankInPool: c.rankInPool,
              score: 0.5,
              reasonTags: [],
            }),
          ),
        })),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: shadowServiceMock(),
        },
      ],
    }).compile();
    await mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1");
    const creates = (prisma.onboardingPhotoPreviewPool.create as jest.Mock).mock
      .calls[0][0].data.items.create as { candidateUserId: string }[];
    expect(creates.every((c) => c.candidateUserId !== "viewer-1")).toBe(true);
    expect(new Set(creates.map((c) => c.candidateUserId)).size).toBe(6);
  });

  it("generate throws when only the viewer exists in the gated candidate universe", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          gender: "male",
        }),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([candidateRow("viewer-1", "2018-01-01", ["x"])])
          .mockResolvedValue([]),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: mockUserImageFindFirst(() => null),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          styleTags: ["清爽自然"],
          preferredCities: [],
          educationPreferences: [],
          occupationPreferences: [],
          relationshipGoalPreferences: [],
          minAge: null,
          maxAge: null,
          minHeight: null,
          maxHeight: null,
        }),
      },
      onboardingPhotoPreviewPool: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        { provide: VisualRankingShadowService, useValue: shadowServiceMock() },
      ],
    }).compile();
    await expect(
      mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.onboardingPhotoPreviewPool.create).not.toHaveBeenCalled();
  });

  it("toViewerBundle never resolves imageUrl from viewer own UserImage when legacy item points at pool owner", async () => {
    const viewerUrl = "https://cdn.example/u/viewer-only.jpg";
    const otherUrl = "https://cdn.example/other.jpg";
    const prisma = {
      onboardingPhotoPreviewPool: {
        findFirst: jest.fn().mockResolvedValue({
          id: "p1",
          userId: "vx",
          status: "active",
          sourceVersion: "onboarding-photo-preview-v1",
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            {
              id: "i1",
              candidateUserId: "other-u",
              tier: "aesthetic_fit",
              displayMode: "clear",
              rankInPool: 1,
              score: 1,
              reasonTags: [],
            },
            {
              id: "i2",
              candidateUserId: "vx",
              tier: "aesthetic_fit",
              displayMode: "clear",
              rankInPool: 2,
              score: 1,
              reasonTags: [],
            },
          ],
        }),
      },
      userImage: {
        findFirst: mockUserImageFindFirst((candidateId, viewerId) => {
          expect(viewerId).toBe("vx");
          if (candidateId === "other-u") return { imageUrl: otherUrl };
          return null;
        }),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        { provide: VisualRankingShadowService, useValue: shadowServiceMock() },
      ],
    }).compile();
    const bundle = await mod.get(OnboardingPhotoPreviewPoolService).findLatestActiveForViewer(
      "vx",
    );
    expect(bundle.items[0]?.imageUrl).toBe(otherUrl);
    expect(bundle.items[1]?.imageUrl == null || bundle.items[1]?.imageUrl === null).toBe(true);
    expect(bundle.items.every((it) => it.imageUrl !== viewerUrl)).toBe(true);
  });

  describe("P7.5-r4-i gender filter (MVP)", () => {
    const prefDto = {
      userId: "viewer-1",
      minAge: null,
      maxAge: null,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: ["清爽自然", "生活感"],
    };

    function femalesSix() {
      return [
        candidateRow("fa", "2020-01-01", ["清爽自然"], "female"),
        candidateRow("fb", "2020-02-01", ["生活感"], "女"),
        candidateRow("fc", "2020-03-01", ["生活感"], "f"),
        candidateRow("fd", "2020-04-01", ["成熟稳重"], "female"),
        candidateRow("fe", "2020-05-01", ["运动阳光"], "female"),
        candidateRow("ff", "2019-01-01", ["有个性"], "female"),
      ];
    }

    function malesSix() {
      return [
        candidateRow("ma", "2020-01-01", ["清爽自然"], "male"),
        candidateRow("mb", "2020-02-01", ["生活感"], "男"),
        candidateRow("mc", "2020-03-01", ["生活感"], "m"),
        candidateRow("md", "2020-04-01", ["成熟稳重"], "male"),
        candidateRow("me", "2020-05-01", ["运动阳光"], "male"),
        candidateRow("mf", "2019-01-01", ["有个性"], "male"),
      ];
    }

    it("male viewer: pool + shadow use only opposite-gender candidates", async () => {
      const batch = femalesSix();
      const createOnboardingPool = jest.fn().mockImplementation(async (args: {
        data: { items: { create: { candidateUserId: string }[] } };
      }) => ({
        id: "pool-g",
        userId: "viewer-1",
        status: "active",
        sourceVersion: "onboarding-photo-preview-v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        items: (args.data.items.create as { candidateUserId: string }[]).map((c, i) => ({
          id: `item-${i}`,
          candidateUserId: c.candidateUserId,
          tier: "aesthetic_fit",
          displayMode: "clear",
          rankInPool: i + 1,
          score: 0.5,
          reasonTags: [],
        })),
      }));
      const prisma = {
        previewPool: { updateMany: jest.fn() },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "male",
          }),
          findMany: mockUserFindManyForGenerate(batch),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: mockUserImageFindFirst((cid) => ({ imageUrl: `https://x/${cid}.jpg` })),
        },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: jest.fn(),
          create: createOnboardingPool,
        },
      };
      const buildForGenerate = jest
        .fn()
        .mockResolvedValue({ computed: false, reason: "shadow_disabled" });
      const computeShadow = jest
        .fn()
        .mockResolvedValue({ computed: false, reason: "shadow_disabled" });
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: VisualRankingShadowService,
            useValue: shadowServiceMock({ buildForGenerate, computeShadow }),
          },
        ],
      }).compile();
      await mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1");

      const createArg = createOnboardingPool.mock.calls[0][0] as {
        data: { items: { create: { candidateUserId: string; tier: string }[] } };
      };
      const creates = createArg.data.items.create;
      expect(new Set(creates.map((c) => c.candidateUserId)).size).toBe(6);
      expect(creates.every((c) => c.candidateUserId.startsWith("f"))).toBe(true);

      const gated = buildForGenerate.mock.calls[0][0].gatedCandidates as { id: string }[];
      expect(gated.every((g) => g.id.startsWith("f"))).toBe(true);
    });

    it("female viewer: pool uses only male candidates", async () => {
      const batch = malesSix();
      const createOnboardingPool = jest.fn().mockImplementation(async (args: {
        data: { items: { create: { candidateUserId: string }[] } };
      }) => ({
        id: "pool-g2",
        userId: "viewer-1",
        status: "active",
        sourceVersion: "onboarding-photo-preview-v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        items: (args.data.items.create as { candidateUserId: string }[]).map((c, i) => ({
          id: `i-${i}`,
          candidateUserId: c.candidateUserId,
          tier: "aesthetic_fit",
          displayMode: "clear",
          rankInPool: i + 1,
          score: 0.5,
          reasonTags: [],
        })),
      }));
      const prisma = {
        previewPool: { updateMany: jest.fn() },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "女",
          }),
          findMany: mockUserFindManyForGenerate(batch),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: mockUserImageFindFirst(() => null),
        },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: jest.fn(),
          create: createOnboardingPool,
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: VisualRankingShadowService,
            useValue: shadowServiceMock(),
          },
        ],
      }).compile();
      await mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1");

      const creates = (
        createOnboardingPool.mock.calls[0][0] as {
          data: { items: { create: { candidateUserId: string }[] } };
        }
      ).data.items.create;
      expect(creates.every((c) => c.candidateUserId.startsWith("m"))).toBe(true);
    });

    it("male viewer throws when gated universe has fewer than 6 opposite-gender candidates", async () => {
      const batch = femalesSix().slice(0, 4);
      const createOnboardingPool = jest.fn();
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "male",
          }),
          findMany: mockUserFindManyForGenerate(batch),
        },
        userImage: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn() },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: jest.fn(),
          create: createOnboardingPool,
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: VisualRankingShadowService,
            useValue: shadowServiceMock(),
          },
        ],
      }).compile();
      await expect(
        mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createOnboardingPool).not.toHaveBeenCalled();
    });

    it("viewer gender missing / invalid throws before archiving pool or computing shadow", async () => {
      const batch = [
        ...(["fa", "fb", "fc", "fd", "fe", "ff"] as const).map((id, i) =>
          candidateRow(id, `202${i}-01-01`, ["清爽自然"], "female"),
        ),
      ];
      const onboardingArchive = jest.fn().mockResolvedValue({ count: 0 });
      const createOnboardingPool = jest.fn();
      const computeShadow = jest.fn();
      const prisma = {
        previewPool: { updateMany: jest.fn() },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "",
          }),
          findMany: mockUserFindManyForGenerate(batch),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: jest.fn(),
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          { provide: VisualRankingShadowService, useValue: shadowServiceMock({ computeShadow }) },
        ],
      }).compile();
      await expect(
        mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1"),
      ).rejects.toThrow("请先完善性别信息后再生成预览池。");
      expect(onboardingArchive).not.toHaveBeenCalled();
      expect(createOnboardingPool).not.toHaveBeenCalled();
      expect(computeShadow).not.toHaveBeenCalled();
    });

    it("male viewer: unknown / same-gender candidates never enter pool or shadow gatedCandidates", async () => {
      const batch = [
        ...femalesSix(),
        candidateRow("xm", "2017-01-01", ["清爽自然"], "male"),
        candidateRow("xu", "2017-02-01", ["生活感"], "unknown"),
        candidateRow("xe", "2017-03-01", ["生活感"], ""),
      ];
      const createOnboardingPool = jest.fn().mockImplementation(async (args: {
        data: { items: { create: { candidateUserId: string }[] } };
      }) => ({
        id: "pool-mix",
        userId: "viewer-1",
        status: "active",
        sourceVersion: "onboarding-photo-preview-v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        items: (args.data.items.create as { candidateUserId: string }[]).map((c, i) => ({
          id: `i-${i}`,
          candidateUserId: c.candidateUserId,
          tier: "aesthetic_fit",
          displayMode: "clear",
          rankInPool: i + 1,
          score: 0.5,
          reasonTags: [],
        })),
      }));
      const buildForGenerate = jest.fn().mockResolvedValue({ computed: false });
      const computeShadow = jest.fn().mockResolvedValue({ computed: false });
      const prisma = {
        previewPool: { updateMany: jest.fn() },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "male",
          }),
          findMany: mockUserFindManyForGenerate(batch),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: mockUserImageFindFirst(() => null),
        },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: jest.fn(),
          create: createOnboardingPool,
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: VisualRankingShadowService,
            useValue: shadowServiceMock({ buildForGenerate, computeShadow }),
          },
        ],
      }).compile();
      await mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1");

      const creates = (
        createOnboardingPool.mock.calls[0][0] as {
          data: { items: { create: { candidateUserId: string }[] } };
        }
      ).data.items.create as { candidateUserId: string }[];
      const ids = new Set(creates.map((c) => c.candidateUserId));
      expect(ids.has("xm")).toBe(false);
      expect(ids.has("xu")).toBe(false);
      expect(ids.has("xe")).toBe(false);
      expect([...ids].every((id) => id.startsWith("f"))).toBe(true);

      const gated = buildForGenerate.mock.calls[0][0].gatedCandidates as { id: string }[];
      expect(gated.every((g) => g.id.startsWith("f"))).toBe(true);
      expect(gated.some((g) => g.id === "xm" || g.id === "xu" || g.id === "xe")).toBe(false);
    });

    it("generate dedupes prisma rows that share the same candidate id before slotting (P7.5-r4-o1)", async () => {
      const sixIds = [
        candidateRow("a", "2020-01-01", ["清爽自然"]),
        candidateRow("b", "2020-02-01", ["生活感"]),
        candidateRow("c", "2020-03-01", ["生活感"]),
        candidateRow("d", "2020-04-01", ["成熟稳重"]),
        candidateRow("e", "2020-05-01", ["运动阳光"]),
        candidateRow("f", "2019-01-01", ["有个性"]),
      ];
      const aDup = candidateRow("a", "2020-01-01", ["清爽自然"]);
      const polluted = [
        aDup,
        {
          ...aDup,
          createdAt: new Date("2021-06-01"),
          images: [
            {
              styleTags: ["生活感"],
              imageUrl: (aDup.images[0] as { imageUrl: string | null }).imageUrl,
            },
          ],
        },
        ...sixIds.slice(1),
      ];
      const createOnboardingPool = jest.fn().mockImplementation(async (args: {
        data: {
          items: {
            create: Array<{
              candidateUserId: string;
              tier: string;
              displayMode: string;
              rankInPool: number;
            }>;
          };
        };
      }) => ({
        id: "pool-dedupe",
        userId: "viewer-1",
        status: "active",
        sourceVersion: "onboarding-photo-preview-v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        items: (args.data.items.create as {
          candidateUserId: string;
          tier: string;
          displayMode: string;
          rankInPool: number;
        }[]).map((c, i) => ({
          id: `i-${i}`,
          candidateUserId: c.candidateUserId,
          tier: c.tier,
          displayMode: c.displayMode,
          rankInPool: c.rankInPool,
          score: 0.5,
          reasonTags: [],
        })),
      }));
      const prisma = {
        previewPool: { updateMany: jest.fn() },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "male",
          }),
          findMany: jest.fn()
            .mockResolvedValueOnce(polluted)
            .mockResolvedValueOnce(sixIds.map((r) => ({ id: r.id, gender: r.gender }))),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: mockUserImageFindFirst(() => null),
        },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: jest.fn(),
          create: createOnboardingPool,
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: VisualRankingShadowService,
            useValue: shadowServiceMock(),
          },
        ],
      }).compile();
      await mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1");
      const creates = (
        createOnboardingPool.mock.calls[0][0] as {
          data: { items: { create: { candidateUserId: string; tier: string }[] } };
        }
      ).data.items.create;
      expect(new Set(creates.map((c) => c.candidateUserId)).size).toBe(6);
      const byTier = (t: string) => creates.filter((c) => c.tier === t).map((c) => c.candidateUserId);
      expect(new Set([...byTier("aesthetic_fit"), ...byTier("style_similar"), ...byTier("reflow")]).size).toBe(
        6,
      );
    });

    it("toViewerBundle imageUrl resolves from UserImage.userId matching candidateUserId only", async () => {
      const prisma = {
        onboardingPhotoPreviewPool: {
          findFirst: jest.fn().mockResolvedValue({
            id: "p-url",
            userId: "v1",
            status: "active",
            sourceVersion: "onboarding-photo-preview-v1",
            createdAt: new Date(),
            updatedAt: new Date(),
            items: [
              {
                id: "i1",
                candidateUserId: "cx",
                tier: "aesthetic_fit",
                displayMode: "clear",
                rankInPool: 1,
                score: 1,
                reasonTags: [],
              },
            ],
          }),
        },
        userImage: {
          findFirst: mockUserImageFindFirst((cid) =>
            cid === "cx"
              ? { imageUrl: "https://cdn/candidate.jpg" }
              : cid === "v1"
                ? { imageUrl: "https://cdn/viewer.jpg" }
                : null,
          ),
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          { provide: VisualRankingShadowService, useValue: shadowServiceMock() },
        ],
      }).compile();
      const bundle = await mod.get(OnboardingPhotoPreviewPoolService).findLatestActiveForViewer(
        "v1",
      );
      expect(bundle.items[0]?.imageUrl).toBe("https://cdn/candidate.jpg");
      expect(bundle.items.every((it) => it.imageUrl !== "https://cdn/viewer.jpg")).toBe(true);
    });
  });

  describe("self-exclusion pure helpers", () => {
    it("isEligiblePreviewCandidate rejects self and blank id", () => {
      expect(isEligiblePreviewCandidate("u1", "u1")).toBe(false);
      expect(isEligiblePreviewCandidate("", "u1")).toBe(false);
      expect(isEligiblePreviewCandidate("c2", "u1")).toBe(true);
    });

    it("buildSixNonSelfPreviewSlots throws when gated pool contains duplicate candidate ids (P7.5-r4-o1)", () => {
      const viewerPref = {
        minAge: null,
        maxAge: null,
        preferredCities: [],
        minHeight: null,
        maxHeight: null,
        educationPreferences: [],
        occupationPreferences: [],
        relationshipGoalPreferences: [],
        styleTags: ["清爽自然"],
      };
      const rowA = toGated(candidateRow("a", "2020-01-01", ["清爽自然"]));
      const gAll = [
        rowA,
        { ...rowA },
        toGated(candidateRow("b", "2020-02-01", ["运动阳光"])),
        toGated(candidateRow("c", "2020-03-01", ["成熟稳重"])),
        toGated(candidateRow("d", "2020-04-01", ["有个性"])),
        toGated(candidateRow("e", "2020-05-01", ["生活感"])),
        toGated(candidateRow("f", "2018-01-01", ["简约干净"])),
      ];
      expect(() => buildSixNonSelfPreviewSlots("viewer-x", gAll, viewerPref)).toThrow(BadRequestException);
    });

    it("buildSixNonSelfPreviewSlots skips viewer embedded in gated rows", () => {
      const gAll = [
        toGated(candidateRow("viewer-99", "2018-01-01", ["x"])),
        toGated(candidateRow("a", "2020-01-01", ["清爽自然"])),
        toGated(candidateRow("b", "2020-02-01", ["清爽自然"])),
        toGated(candidateRow("c", "2020-03-01", ["生活感"])),
        toGated(candidateRow("d", "2020-04-01", ["成熟稳重"])),
        toGated(candidateRow("e", "2020-05-01", ["运动阳光"])),
        toGated(candidateRow("f", "2019-01-01", ["有个性"])),
      ];
      const viewerPref = {
        minAge: null,
        maxAge: null,
        preferredCities: [],
        minHeight: null,
        maxHeight: null,
        educationPreferences: [],
        occupationPreferences: [],
        relationshipGoalPreferences: [],
        styleTags: ["清爽自然"],
      };
      const { slotDefs } = buildSixNonSelfPreviewSlots("viewer-99", gAll, viewerPref);
      expect(slotDefs).toHaveLength(6);
      expect(slotDefs.every((s) => s.candidateId !== "viewer-99")).toBe(true);
      const tiers = slotDefs.reduce(
        (m, s) => {
          m[s.tier] = (m[s.tier] ?? 0) + 1;
          return m;
        },
        {} as Record<string, number>,
      );
      expect(tiers.aesthetic_fit).toBe(3);
      expect(tiers.style_similar).toBe(2);
      expect(tiers.reflow).toBe(1);
    });

    it("buildSixNonSelfPreviewSlots throws when only six users but two share the same r4h display source (P7.5-r4-o2)", () => {
      const viewerPref = {
        minAge: null,
        maxAge: null,
        preferredCities: [],
        minHeight: null,
        maxHeight: null,
        educationPreferences: [],
        occupationPreferences: [],
        relationshipGoalPreferences: [],
        styleTags: ["清爽自然"],
      };
      const dup = "https://cdn/z-r4h-uu--samefile--.jpg";
      const gAll = [
        toGated(candidateRow("a", "2020-01-01", ["清爽自然"], "female", dup)),
        toGated(candidateRow("b", "2020-02-01", ["生活感"], "female", dup)),
        toGated(candidateRow("c", "2020-03-01", ["成熟稳重"], "female")),
        toGated(candidateRow("d", "2020-04-01", ["有个性"], "female")),
        toGated(candidateRow("e", "2020-05-01", ["运动阳光"], "female")),
        toGated(candidateRow("f", "2018-01-01", ["简约干净"], "female")),
      ];
      expect(() => buildSixNonSelfPreviewSlots("vx", gAll, viewerPref)).toThrow(BadRequestException);
    });

    it("buildSixNonSelfPreviewSlots succeeds with seven users when two share one r4h source (P7.5-r4-o2)", () => {
      const viewerPref = {
        minAge: null,
        maxAge: null,
        preferredCities: [],
        minHeight: null,
        maxHeight: null,
        educationPreferences: [],
        occupationPreferences: [],
        relationshipGoalPreferences: [],
        styleTags: ["清爽自然"],
      };
      const dup = "https://cdn/z-r4h-uu--samefile--.jpg";
      const gAll = [
        toGated(candidateRow("a", "2020-01-01", ["清爽自然"], "female", dup)),
        toGated(candidateRow("b", "2020-02-01", ["生活感"], "female", dup)),
        toGated(candidateRow("c", "2020-03-01", ["成熟稳重"], "female")),
        toGated(candidateRow("d", "2020-04-01", ["有个性"], "female")),
        toGated(candidateRow("e", "2020-05-01", ["运动阳光"], "female")),
        toGated(candidateRow("f", "2018-01-01", ["简约干净"], "female")),
        toGated(candidateRow("g", "2017-06-01", ["清爽自然", "生活感"], "female")),
      ];
      const { slotDefs } = buildSixNonSelfPreviewSlots("vx", gAll, viewerPref);
      expect(slotDefs).toHaveLength(6);
      const keys = slotDefs.map((s) =>
        previewPoolRowDisplaySourceKey(gAll.find((r) => r.id === s.candidateId)!),
      );
      expect(new Set(keys).size).toBe(6);
      expect(new Set(slotDefs.map((s) => s.candidateId)).size).toBe(6);
    });
  });
});
