import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { OnboardingPhotoPreviewPoolService } from "../src/modules/onboarding/onboarding-photo-preview-pool.service";
import { VisualRankingShadowService } from "../src/modules/onboarding/vision/visual-ranking-shadow.service";

function candidateRow(
  id: string,
  iso: string,
  styleTags: string[],
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
    images: [{ styleTags }],
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
          candidateUserId: `cand-${i}`,
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
    expect(previewPoolUpdateMany).not.toHaveBeenCalled();
    expect(onboardingArchive).toHaveBeenCalled();
    const createArg = createPool.mock.calls[0][0] as {
      data: { items: { create: unknown[] } };
    };
    const items = createArg.data.items.create as {
      tier: string;
      displayMode: string;
      rankInPool: number;
    }[];
    expect(items).toHaveLength(6);
    expect(items.filter((i) => i.tier === "aesthetic_fit" && i.displayMode === "clear")).toHaveLength(3);
    expect(items.filter((i) => i.tier === "style_similar" && i.displayMode === "blurred")).toHaveLength(2);
    expect(items.filter((i) => i.tier === "reflow" && i.displayMode === "hidden")).toHaveLength(1);
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
      items: (args.data.items.create as { rankInPool: number; tier: string; displayMode: string }[]).map(
        (c, i) => ({
          id: `item-${i}`,
          candidateUserId: `cand-${i}`,
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
});
