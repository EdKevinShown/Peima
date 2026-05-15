import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  OnboardingPhotoPreviewPoolService,
  buildSixNonSelfPreviewSlots,
  isEligiblePreviewCandidate,
} from "../src/modules/onboarding/onboarding-photo-preview-pool.service";
import { VisualRankingShadowService } from "../src/modules/onboarding/vision/visual-ranking-shadow.service";

function candidateRow(
  id: string,
  iso: string,
  styleTags: string[],
  /** Default opposite to a male viewer preview path. */
  gender = "female",
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
    images: [{ styleTags }],
  };
}

function toGated(row: ReturnType<typeof candidateRow>) {
  const im = row.images[0];
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
    gender: row.gender ?? "",
  };
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
        findMany: jest.fn(),
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
      .mockResolvedValue([]);

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

    (prisma.userImage as { findMany: jest.Mock }).findMany = jest.fn().mockResolvedValue([
      { userId: "a", imageUrl: "https://x/a.jpg", createdAt: new Date("2020-01-01") },
    ]);

    const computeShadow = jest
      .fn()
      .mockResolvedValue({ computed: false, reason: "shadow_disabled" });
    const moduleRefWithShadow = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        { provide: VisualRankingShadowService, useValue: { computeShadow } },
      ],
    }).compile();
    const svcWithShadow = moduleRefWithShadow.get(OnboardingPhotoPreviewPoolService);

    await svcWithShadow.generate("viewer-1");

    expect(computeShadow).toHaveBeenCalled();
    const shadowPayload = computeShadow.mock.calls[0]?.[0] as {
      viewerUserId: string;
      baselineItems: Array<{ candidateUserId: string }>;
      gatedCandidates: Array<{ id: string }>;
    };
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
    expect(items.every((i) => i.candidateUserId !== "viewer-1")).toBe(true);
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
          .mockResolvedValue([]),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { userId: "a", imageUrl: "https://x/a.jpg", createdAt: new Date("2020-01-01") },
        ]),
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
          useValue: { computeShadow: jest.fn().mockResolvedValue({ computed: false }) },
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
        findMany: jest.fn().mockResolvedValueOnce(six).mockResolvedValue([]),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { userId: "a", imageUrl: "https://x/a.jpg", createdAt: new Date("2020-01-01") },
        ]),
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
          useValue: {
            computeShadow: jest.fn().mockRejectedValue(new Error("shadow failed")),
          },
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
          useValue: { computeShadow: jest.fn() },
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
        findMany: jest.fn().mockResolvedValue([
          { userId: "c1", imageUrl: "https://secret.jpg", createdAt: new Date() },
        ]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: { computeShadow: jest.fn() },
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
        findMany: jest.fn().mockResolvedValueOnce(polluted).mockResolvedValue([]),
      },
      userImage: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
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
          useValue: {
            computeShadow: jest
              .fn()
              .mockResolvedValue({ computed: false, reason: "shadow_disabled" }),
          },
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
        findMany: jest.fn().mockResolvedValue([]),
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
        { provide: VisualRankingShadowService, useValue: { computeShadow: jest.fn() } },
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
        findMany: jest.fn().mockImplementation((q: unknown) => {
          const qw = (
            typeof q === "object" &&
            q !== null &&
            "where" in q &&
            (
              q as {
                where?: { AND?: Array<{ userId?: unknown }> };
              }
            ).where
              ? (q as {
                  where: { AND?: Array<{ userId?: unknown }> };
                }).where
              : null
          );
          const clauses = qw?.AND ?? [];
          const notVx = clauses.some(
            (c) =>
              c.userId !== undefined &&
              typeof c.userId === "object" &&
              c.userId !== null &&
              "not" in c.userId &&
              (c.userId as { not: string }).not === "vx",
          );
          expect(notVx).toBe(true);
          return Promise.resolve([
            {
              userId: "other-u",
              imageUrl: otherUrl,
              createdAt: new Date("2020-01-01"),
            },
          ]);
        }),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        { provide: VisualRankingShadowService, useValue: { computeShadow: jest.fn() } },
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
          findMany: jest.fn().mockResolvedValueOnce(batch).mockResolvedValue([]),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue(
            batch.map((r) => ({
              userId: r.id,
              imageUrl: `https://x/${r.id}.jpg`,
              createdAt: r.createdAt,
            })),
          ),
        },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: jest.fn(),
          create: createOnboardingPool,
        },
      };
      const computeShadow = jest.fn().mockResolvedValue({ computed: false, reason: "shadow_disabled" });
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          { provide: VisualRankingShadowService, useValue: { computeShadow } },
        ],
      }).compile();
      await mod.get(OnboardingPhotoPreviewPoolService).generate("viewer-1");

      const createArg = createOnboardingPool.mock.calls[0][0] as {
        data: { items: { create: { candidateUserId: string; tier: string }[] } };
      };
      const creates = createArg.data.items.create;
      expect(new Set(creates.map((c) => c.candidateUserId)).size).toBe(6);
      expect(creates.every((c) => c.candidateUserId.startsWith("f"))).toBe(true);

      const gated = computeShadow.mock.calls[0][0].gatedCandidates as { id: string }[];
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
          findMany: jest.fn().mockResolvedValueOnce(batch).mockResolvedValue([]),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([]),
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
            useValue: { computeShadow: jest.fn().mockResolvedValue({ computed: false }) },
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
          findMany: jest.fn().mockResolvedValueOnce(batch).mockResolvedValue([]),
        },
        userImage: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn() },
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
            useValue: { computeShadow: jest.fn() },
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
          findMany: jest.fn().mockResolvedValueOnce(batch).mockResolvedValue([]),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn(),
        },
        userPreference: { findUnique: jest.fn().mockResolvedValue(prefDto) },
        onboardingPhotoPreviewPool: {
          updateMany: onboardingArchive,
          create: createOnboardingPool,
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          { provide: VisualRankingShadowService, useValue: { computeShadow } },
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
      const computeShadow = jest.fn().mockResolvedValue({ computed: false });
      const prisma = {
        previewPool: { updateMany: jest.fn() },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            onboardingPhotoAestheticCompletedAt: new Date(),
            gender: "male",
          }),
          findMany: jest.fn().mockResolvedValueOnce(batch).mockResolvedValue([]),
        },
        userImage: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([]),
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
            useValue: { computeShadow },
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

      const gated = computeShadow.mock.calls[0][0].gatedCandidates as { id: string }[];
      expect(gated.every((g) => g.id.startsWith("f"))).toBe(true);
      expect(gated.some((g) => g.id === "xm" || g.id === "xu" || g.id === "xe")).toBe(false);
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
          findMany: jest.fn().mockResolvedValue([
            {
              userId: "cx",
              imageUrl: "https://cdn/candidate.jpg",
              createdAt: new Date(),
            },
            {
              userId: "v1",
              imageUrl: "https://cdn/viewer.jpg",
              createdAt: new Date(),
            },
          ]),
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          OnboardingPhotoPreviewPoolService,
          { provide: PrismaService, useValue: prisma },
          { provide: VisualRankingShadowService, useValue: { computeShadow: jest.fn() } },
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
  });
});
