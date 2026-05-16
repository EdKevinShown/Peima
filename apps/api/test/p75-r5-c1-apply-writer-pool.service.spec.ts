/**
 * P7.5-r5-c1: OnboardingPhotoPreviewPoolService allowlist-only APPLY writer.
 */

import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  OnboardingPhotoPreviewPoolService,
  ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION,
} from "../src/modules/onboarding/onboarding-photo-preview-pool.service";
import { buildActivePoolAuditReport } from "../src/modules/onboarding/onboarding-photo-preview-pool-active-audit";
import {
  buildShadowCandidatesFromGatedRows,
  buildVisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.builder";
import { VisualRankingShadowService } from "../src/modules/onboarding/vision/visual-ranking-shadow.service";
import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import type { VisualRankingShadowV1 } from "../src/modules/onboarding/vision/visual-ranking-shadow.types";

const VIEWER = "viewer-1";

function candidateRow(
  id: string,
  iso: string,
  styleTags: string[],
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

function mockUserImageFindFirst() {
  return jest.fn().mockImplementation(
    (args: { where?: { AND?: Array<{ userId?: unknown }> } }) => {
      const and = args.where?.AND ?? [];
      const eq = and.find((c) => typeof c.userId === "string") as
        | { userId: string }
        | undefined;
      const candidateId = eq?.userId;
      if (!candidateId) return Promise.resolve(null);
      return Promise.resolve({ imageUrl: `https://x/${candidateId}.jpg` });
    },
  );
}

const gatedRows = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
  candidateRow(id, `2020-0${i + 1}-01`, ["清爽自然"]),
);

const fullViewerPref = {
  minAge: null,
  maxAge: null,
  preferredCities: [] as string[],
  minHeight: null,
  maxHeight: null,
  educationPreferences: [] as string[],
  occupationPreferences: [] as string[],
  relationshipGoalPreferences: [] as string[],
  styleTags: ["清爽自然", "生活感"],
};

function mkShadow(baselineIds = ["a", "b", "c", "d", "e", "f"]): VisualRankingShadowV1 {
  const candidates = buildShadowCandidatesFromGatedRows(
    gatedRows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      firstImageStyleTags: r.images[0]!.styleTags,
      age: r.age,
      city: r.city,
      height: r.height,
      education: r.education,
      occupation: r.occupation,
      relationshipGoal: r.relationshipGoal,
    })),
    new Map(),
  );
  const tiers = [
    "aesthetic_fit",
    "aesthetic_fit",
    "aesthetic_fit",
    "style_similar",
    "style_similar",
    "reflow",
  ] as const;
  const display = ["clear", "clear", "clear", "blurred", "blurred", "hidden"] as const;
  return buildVisualRankingShadowV1({
    viewerUserId: VIEWER,
    poolId: "pool-provisional",
    baselineItems: baselineIds.map((id, i) => ({
      rankInPool: i + 1,
      tier: tiers[i]!,
      displayMode: display[i]!,
      candidateUserId: id,
      score: 0.5 - i * 0.05,
    })),
    viewerStyleTags: ["清爽自然", "生活感"],
    viewerPhotoVisualTags: null,
    viewerVisionAvailable: false,
    candidates,
    viewerPref: fullViewerPref,
    env: { ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv), shadowEnabled: true },
  });
}

function setupPrisma(createPool: jest.Mock) {
  return {
    previewPool: { updateMany: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        onboardingPhotoAestheticCompletedAt: new Date(),
        gender: "male",
      }),
      findMany: mockUserFindManyForGenerate(gatedRows),
    },
    userImage: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: mockUserImageFindFirst(),
    },
    userPreference: {
      findUnique: jest.fn().mockResolvedValue({
        userId: VIEWER,
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
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: createPool,
    },
  };
}

describe("OnboardingPhotoPreviewPoolService P7.5-r5-c1 apply writer", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function applyEnv(overrides: Record<string, string | undefined>) {
    process.env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL = "0";
    process.env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS = "";
    process.env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT = "0";
    delete process.env.PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION;
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  async function runGenerateWithShadow(
    shadow: VisualRankingShadowV1,
    envOverrides: Record<string, string | undefined> = {},
  ) {
    applyEnv({
      PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "1",
      PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: VIEWER,
      PEIMA_ONBOARDING_VISION_APPLY_PERCENT: "0",
      ...envOverrides,
    });

    const createPool = jest.fn().mockImplementation(
      async (args: {
        data: {
          sourceVersion: string;
          items: { create: Array<Record<string, unknown>> };
        };
      }) => {
        const creates = args.data.items.create;
        return {
          id: "pool-c1",
          userId: VIEWER,
          status: "active",
          sourceVersion: args.data.sourceVersion,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: creates.map((c, i) => ({
            id: `item-${i}`,
            candidateUserId: c.candidateUserId as string,
            tier: c.tier as string,
            displayMode: c.displayMode as string,
            rankInPool: c.rankInPool as number,
            score: c.score as number,
            reasonTags: c.reasonTags as string[],
          })),
        };
      },
    );

    const buildForGenerate = jest.fn().mockResolvedValue({ computed: true, shadow });
    const computeShadow = jest.fn().mockImplementation(async (input) => {
      const persisted = {
        ...shadow,
        poolId: input.poolId,
        summary: {
          ...shadow.summary,
          applyDryRun: {
            evaluated: true,
            eligible: true,
            reason: "ok",
            applySourceVersion: "onboarding-photo-preview-v2-vision",
            appliedToPool: false,
          },
          applyResult: input.writerDecision?.shouldApply
            ? {
                evaluated: true,
                applied: true,
                reason: "ok",
                sourceVersion: "onboarding-photo-preview-v2-vision",
              }
            : {
                evaluated: true,
                applied: false,
                reason: input.writerDecision?.reason ?? "not_in_allowlist",
                sourceVersion: "onboarding-photo-preview-v2-vision",
              },
        },
      };
      return { computed: true, shadow: persisted, persist: { persisted: true } };
    });

    const prisma = setupPrisma(createPool);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingPhotoPreviewPoolService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VisualRankingShadowService,
          useValue: { buildForGenerate, computeShadow },
        },
      ],
    }).compile();

    const bundle = await moduleRef
      .get(OnboardingPhotoPreviewPoolService)
      .generate(VIEWER);

    return { bundle, createPool, computeShadow, buildForGenerate };
  }

  it("default env (gate off) creates v1 pool", async () => {
    applyEnv({});
    const shadow = mkShadow();
    const { bundle, createPool } = await runGenerateWithShadow(shadow, {
      PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "0",
      PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: "",
    });
    expect(bundle.pool.sourceVersion).toBe(ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION);
    const createArg = createPool.mock.calls[0][0] as {
      data: { sourceVersion: string; items: { create: { reasonTags: string[] }[] } };
    };
    expect(createArg.data.sourceVersion).toBe(ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION);
    expect(createArg.data.items.create[0]?.reasonTags).toContain(
      ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION,
    );
  });

  it("allowlist hit writes v2 sourceVersion and shadow order", async () => {
    const shadow = mkShadow();
    const reordered = { ...shadow };
    reordered.slots = shadow.slots.map((s, i) => ({
      ...s,
      shadowCandidateUserId: ["f", "e", "d", "c", "b", "a"][i]!,
    }));

    const { bundle, createPool, computeShadow } = await runGenerateWithShadow(reordered);
    expect(bundle.pool.sourceVersion).toBe("onboarding-photo-preview-v2-vision");
    const createArg = createPool.mock.calls[0][0] as {
      data: { items: { create: { candidateUserId: string; rankInPool: number; tier: string; displayMode: string; reasonTags: string[] }[] } };
    };
    const items = createArg.data.items.create;
    expect(items[0]?.candidateUserId).toBe("f");
    expect(items[0]?.tier).toBe("aesthetic_fit");
    expect(items[0]?.displayMode).toBe("clear");
    expect(items[5]?.tier).toBe("reflow");
    expect(items[5]?.displayMode).toBe("hidden");
    expect(items[0]?.reasonTags).toContain("vision:apply");

    const persisted = computeShadow.mock.calls[0][0];
    expect(persisted.writerDecision?.shouldApply).toBe(true);
    expect(persisted.eligibility?.reason).toBe("ok");
  });

  it("allowlist empty with percent 100 still v1", async () => {
    const shadow = mkShadow();
    const { bundle } = await runGenerateWithShadow(shadow, {
      PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: "",
      PEIMA_ONBOARDING_VISION_APPLY_PERCENT: "100",
    });
    expect(bundle.pool.sourceVersion).toBe(ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION);
  });

  it("allowlist miss stays v1", async () => {
    const shadow = mkShadow();
    const { bundle } = await runGenerateWithShadow(shadow, {
      PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: "other-user",
    });
    expect(bundle.pool.sourceVersion).toBe(ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION);
  });

  it("active audit passes for v2-shaped pool items", async () => {
    const shadow = mkShadow();
    const { bundle } = await runGenerateWithShadow(shadow);
    const audit = buildActivePoolAuditReport({
      viewerUserId: VIEWER,
      viewerGenderRaw: "male",
      pool: {
        id: bundle.pool.id,
        status: bundle.pool.status,
        sourceVersion: bundle.pool.sourceVersion,
      },
      items: bundle.items.map((it) => ({
        rankInPool: it.rankInPool,
        tier: it.tier,
        displayMode: it.displayMode,
        candidateUserId: it.candidateUserId,
        candidateGenderRaw: "female",
        firstImageUrl: `https://cdn.example.test/u/${it.candidateUserId}-r4h-u${it.candidateUserId}--kimono-${it.candidateUserId}--.jpg`,
      })),
      mappingItems: [],
    });
    expect(audit.pool_source_version).toBe("onboarding-photo-preview-v2-vision");
    expect(audit.items.every((i) => !i.is_viewer_self)).toBe(true);
    expect(audit.items.every((i) => !i.violates_opposite_gender_gate)).toBe(true);
    expect(audit.items.every((i) => !i.duplicate_candidate_user_id)).toBe(true);
    expect(audit.items.every((i) => !i.duplicate_image_source_key)).toBe(true);
  });

  it("env off: v1 pool and computeShadow still runs when shadow built", async () => {
    const shadow = mkShadow();
    const { bundle, computeShadow } = await runGenerateWithShadow(shadow, {
      PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "0",
      PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: VIEWER,
    });
    expect(bundle.pool.sourceVersion).toBe(ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION);
    expect(computeShadow).toHaveBeenCalled();
    const arg = computeShadow.mock.calls[0][0];
    expect(arg.writerDecision?.shouldApply).toBe(false);
    expect(arg.writerDecision?.reason).toBe("env_disabled");
  });
});
