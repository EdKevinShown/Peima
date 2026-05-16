import {
  buildShadowCandidatesFromGatedRows,
  buildVisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.builder";
import {
  persistVisualRankingShadow,
  VISUAL_RANKING_SHADOW_TYPE,
} from "../src/modules/onboarding/vision/visual-ranking-shadow-persist";
import {
  VISUAL_RANKING_SHADOW_SOURCE_VERSION,
  type VisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.types";
import {
  scoreAestheticFitShadow,
  scoreStyleSimilarShadow,
  tagJaccard,
} from "../src/modules/onboarding/vision/visual-ranking-shadow-scoring";
import {
  extractUsableVisionFromDetectionScoreJson,
  pickViewerPassingPhotoVision,
} from "../src/modules/onboarding/vision/visual-ranking-shadow-vision-input";
import { VisualRankingShadowService } from "../src/modules/onboarding/vision/visual-ranking-shadow.service";
import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { readOnboardingVisionApplyEnv } from "../src/modules/onboarding/vision/onboarding-vision-apply-env";
import { ONBOARDING_VISION_SCHEMA_VERSION } from "../src/modules/onboarding/vision/onboarding-vision.types";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";

const baseEnv = {
  ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
  shadowEnabled: true,
};

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

function visionProfile(tags: string[], confidence = 0.7) {
  return {
    schemaVersion: ONBOARDING_VISION_SCHEMA_VERSION,
    sourceVersion: "p7.5-r2-rules",
    photoVisualTaxonomyVersion: "p7.5-v1" as const,
    provider: "rules" as const,
    generatedAt: new Date().toISOString(),
    visionStatus: "ok" as const,
    fallbackUsed: false,
    photoVisualTags: tags,
    confidence,
  };
}

function candidate(
  id: string,
  iso: string,
  styleTags: string[],
  visionTags?: string[],
) {
  return {
    userId: id,
    createdAt: new Date(iso),
    styleTags,
    vision: visionTags
      ? { photoVisualTags: visionTags, confidence: 0.8 }
      : null,
    preferenceFields: {
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
  };
}

describe("visual-ranking-shadow scoring", () => {
  it("aesthetic_fit: more tag overlap yields higher shadowScore", () => {
    const viewerTags = ["清爽自然", "生活感"];
    const high = scoreAestheticFitShadow(
      viewerTags,
      candidate("a", "2020-01-01", [], ["清爽自然", "生活感"]),
      { styleTags: viewerTags } as never,
    );
    const low = scoreAestheticFitShadow(
      viewerTags,
      candidate("b", "2020-01-01", [], ["成熟稳重"]),
      { styleTags: viewerTags } as never,
    );
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.reason).toBe("aesthetic_tag_overlap");
    expect(tagJaccard(["清爽自然", "生活感"], ["清爽自然", "生活感"])).toBe(1);
  });

  it("style_similar: viewer and candidate visual tags increase shadowScore", () => {
    const viewerTags = ["文艺温柔", "生活感"];
    const high = scoreStyleSimilarShadow(
      viewerTags,
      true,
      candidate("a", "2020-01-01", [], ["文艺温柔", "生活感"]),
      null,
    );
    const low = scoreStyleSimilarShadow(
      viewerTags,
      true,
      candidate("b", "2020-01-01", [], ["运动阳光"]),
      null,
    );
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.reason).toBe("style_tag_similarity");
  });

  it("missing vision falls back to baseline without throwing", () => {
    const r = scoreAestheticFitShadow(
      ["清爽自然"],
      candidate("a", "2020-01-01", ["清爽自然"], undefined),
      { styleTags: ["清爽自然"] } as never,
    );
    expect(r.reason).toBe("vision_fallback_baseline");
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe("visual-ranking-shadow vision input", () => {
  it("rejected review excludes candidate vision", () => {
    expect(
      extractUsableVisionFromDetectionScoreJson(
        { vision: visionProfile(["生活感"]) },
        "rejected",
      ),
    ).toBeNull();
  });

  it("pickViewerPassingPhotoVision uses latest passing ok vision", () => {
    const v = pickViewerPassingPhotoVision([
      {
        id: "1",
        userId: "viewer",
        createdAt: new Date("2020-01-01"),
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: { vision: visionProfile(["旧标签"]) },
      },
      {
        id: "2",
        userId: "viewer",
        createdAt: new Date("2021-01-01"),
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: { vision: visionProfile(["清爽自然"]) },
      },
    ]);
    expect(v?.photoVisualTags).toEqual(["清爽自然"]);
  });
});

describe("buildVisualRankingShadowV1", () => {
  const gatedRows = [
    {
      id: "a",
      createdAt: new Date("2020-01-01"),
      firstImageStyleTags: ["清爽自然"],
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    {
      id: "b",
      createdAt: new Date("2020-02-01"),
      firstImageStyleTags: ["清爽自然", "生活感"],
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    {
      id: "c",
      createdAt: new Date("2020-03-01"),
      firstImageStyleTags: ["生活感"],
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    {
      id: "d",
      createdAt: new Date("2020-04-01"),
      firstImageStyleTags: ["成熟稳重"],
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    {
      id: "e",
      createdAt: new Date("2020-05-01"),
      firstImageStyleTags: ["运动阳光"],
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    {
      id: "f",
      createdAt: new Date("2019-01-01"),
      firstImageStyleTags: ["有个性"],
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
  ];

  it("shadow only: appliedToPool false; baseline slots preserved in comparison", () => {
    const visionByUser = new Map([
      ["a", { photoVisualTags: ["清爽自然"], confidence: 0.9 }],
      ["b", { photoVisualTags: ["清爽自然", "生活感"], confidence: 0.9 }],
      ["c", { photoVisualTags: ["生活感"], confidence: 0.8 }],
    ]);
    const candidates = buildShadowCandidatesFromGatedRows(gatedRows, visionByUser);
    const shadow = buildVisualRankingShadowV1({
      viewerUserId: "viewer",
      poolId: "pool-1",
      baselineItems: [
        { rankInPool: 1, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "a", score: 0.5 },
        { rankInPool: 2, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "b", score: 0.4 },
        { rankInPool: 3, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "c", score: 0.3 },
        { rankInPool: 4, tier: "style_similar", displayMode: "blurred", candidateUserId: "d", score: 0.2 },
        { rankInPool: 5, tier: "style_similar", displayMode: "blurred", candidateUserId: "e", score: 0.1 },
        { rankInPool: 6, tier: "reflow", displayMode: "hidden", candidateUserId: "f", score: 0.4 },
      ],
      viewerStyleTags: ["清爽自然", "生活感"],
      viewerPhotoVisualTags: ["清爽自然"],
      viewerVisionAvailable: true,
      candidates,
      viewerPref: fullViewerPref,
      env: baseEnv,
    });

    expect(shadow.appliedToPool).toBe(false);
    expect(shadow.slots).toHaveLength(6);
    expect(shadow.slots[0].baselineCandidateUserId).toBe("a");
    expect(shadow.summary.candidatesWithVision).toBe(3);
    expect(shadow.summary.candidatesMissingVision).toBe(3);
  });

  it("applyToPoolIgnoredHint sets applyToPoolIgnored; still appliedToPool false", () => {
    const candidates = buildShadowCandidatesFromGatedRows(gatedRows, new Map());
    const shadow = buildVisualRankingShadowV1({
      viewerUserId: "viewer",
      poolId: "pool-1",
      baselineItems: [
        { rankInPool: 1, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "a", score: 0.5 },
        { rankInPool: 2, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "b", score: 0.4 },
        { rankInPool: 3, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "c", score: 0.3 },
        { rankInPool: 4, tier: "style_similar", displayMode: "blurred", candidateUserId: "d", score: 0.2 },
        { rankInPool: 5, tier: "style_similar", displayMode: "blurred", candidateUserId: "e", score: 0.1 },
        { rankInPool: 6, tier: "reflow", displayMode: "hidden", candidateUserId: "f", score: 0.4 },
      ],
      viewerStyleTags: ["清爽自然"],
      viewerPhotoVisualTags: null,
      viewerVisionAvailable: false,
      candidates,
      viewerPref: { ...fullViewerPref, styleTags: ["清爽自然"] },
      env: baseEnv,
      applyToPoolIgnoredHint: true,
    });
    expect(shadow.appliedToPool).toBe(false);
    expect(shadow.summary.applyToPoolIgnored).toBe(true);
  });
});

function sampleShadowPayload(): VisualRankingShadowV1 {
  return {
    schemaVersion: "visual-ranking-shadow-v1",
    sourceVersion: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
    generatedAt: new Date().toISOString(),
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    baselineSourceVersion: "onboarding-photo-preview-v1",
    shadowSourceVersion: "onboarding-photo-preview-v1-vision-shadow",
    appliedToPool: false,
    slots: [],
    summary: {
      changedSlots: 0,
      changedTiers: [],
      candidatesWithVision: 2,
      candidatesMissingVision: 4,
      viewerVisionAvailable: true,
    },
  };
}

describe("visual-ranking-shadow persist (P7.5-r4-b)", () => {
  it("upserts shadow row with correct keys and payload", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const shadow = sampleShadowPayload();
    const result = await persistVisualRankingShadow(
      { onboardingPhotoPreviewPoolShadow: { upsert } } as never,
      "pool-1",
      "viewer-1",
      shadow,
    );
    expect(result).toEqual({ persisted: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          poolId_shadowType_sourceVersion: {
            poolId: "pool-1",
            shadowType: VISUAL_RANKING_SHADOW_TYPE,
            sourceVersion: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
          },
        },
        create: expect.objectContaining({
          poolId: "pool-1",
          userId: "viewer-1",
          shadowType: VISUAL_RANKING_SHADOW_TYPE,
          sourceVersion: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
          payloadJson: shadow,
        }),
        update: expect.objectContaining({
          userId: "viewer-1",
          payloadJson: shadow,
        }),
      }),
    );
  });

  it("upsert is idempotent on same poolId + shadowType + sourceVersion", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const shadow = sampleShadowPayload();
    const prisma = { onboardingPhotoPreviewPoolShadow: { upsert } } as never;
    await persistVisualRankingShadow(prisma, "pool-1", "viewer-1", shadow);
    const updated = {
      ...shadow,
      summary: { ...shadow.summary, changedSlots: 2 },
    };
    await persistVisualRankingShadow(prisma, "pool-1", "viewer-1", updated);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][0].update.payloadJson).toEqual(updated);
  });

  it("returns persist_error when upsert throws", async () => {
    const result = await persistVisualRankingShadow(
      {
        onboardingPhotoPreviewPoolShadow: {
          upsert: jest.fn().mockRejectedValue(new Error("db down")),
        },
      } as never,
      "pool-1",
      "viewer-1",
      sampleShadowPayload(),
    );
    expect(result.persisted).toBe(false);
    if (!result.persisted) {
      expect(result.reason).toBe("persist_error");
    }
  });
});

describe("VisualRankingShadowService", () => {
  const computeInput = {
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    baselineItems: [
      {
        rankInPool: 1,
        tier: "aesthetic_fit",
        displayMode: "clear",
        candidateUserId: "a",
        score: 0.5,
      },
    ],
    gatedCandidates: [
      {
        id: "a",
        createdAt: new Date("2020-01-01"),
        firstImageStyleTags: ["清爽自然"],
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
      },
    ],
    viewerStyleTags: ["清爽自然"],
    viewerPref: fullViewerPref,
  };

  it("returns shadow_disabled when SHADOW_ENABLED=false", async () => {
    const upsert = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VisualRankingShadowService,
        {
          provide: PrismaService,
          useValue: {
            userImage: { findMany: jest.fn() },
            onboardingPhotoPreviewPoolShadow: { upsert },
          },
        },
      ],
    }).compile();
    const svc = moduleRef.get(VisualRankingShadowService);
    const result = await svc.computeShadow(
      {
        viewerUserId: "v",
        poolId: "p",
        baselineItems: [],
        gatedCandidates: [],
        viewerStyleTags: [],
        viewerPref: null,
      },
      { ...baseEnv, shadowEnabled: false },
    );
    expect(result).toEqual({ computed: false, reason: "shadow_disabled" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("computeShadow persists shadow when enabled", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "img-v",
        userId: "viewer-1",
        createdAt: new Date("2021-01-01"),
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: {
          vision: {
            schemaVersion: ONBOARDING_VISION_SCHEMA_VERSION,
            sourceVersion: "p7.5-r2-rules",
            photoVisualTaxonomyVersion: "p7.5-v1",
            provider: "rules",
            generatedAt: new Date().toISOString(),
            visionStatus: "ok",
            fallbackUsed: false,
            photoVisualTags: ["清爽自然"],
            confidence: 0.8,
          },
        },
      },
      {
        id: "img-a",
        userId: "a",
        createdAt: new Date("2020-01-01"),
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: {
          vision: {
            schemaVersion: ONBOARDING_VISION_SCHEMA_VERSION,
            sourceVersion: "p7.5-r2-rules",
            photoVisualTaxonomyVersion: "p7.5-v1",
            provider: "rules",
            generatedAt: new Date().toISOString(),
            visionStatus: "ok",
            fallbackUsed: false,
            photoVisualTags: ["清爽自然", "生活感"],
            confidence: 0.9,
          },
        },
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        VisualRankingShadowService,
        {
          provide: PrismaService,
          useValue: {
            userImage: { findMany },
            onboardingPhotoPreviewPoolShadow: { upsert },
          },
        },
      ],
    }).compile();
    const svc = moduleRef.get(VisualRankingShadowService);
    const result = await svc.computeShadow(computeInput, baseEnv);
    expect(result.computed).toBe(true);
    if (result.computed) {
      expect(result.persist).toEqual({ persisted: true });
      expect(result.shadow.schemaVersion).toBe("visual-ranking-shadow-v1");
      expect(result.shadow.appliedToPool).toBe(false);
      expect(result.shadow.summary.applyDryRun?.evaluated).toBe(true);
      expect(result.shadow.summary.applyDryRun?.reason).toBe("env_disabled");
      expect(upsert).toHaveBeenCalled();
    }
  });

  it("PEIMA_ONBOARDING_VISION_APPLY_TO_POOL=1: persisted shadow has applyToPoolIgnored and applyDryRun", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        VisualRankingShadowService,
        {
          provide: PrismaService,
          useValue: {
            userImage: { findMany },
            onboardingPhotoPreviewPoolShadow: { upsert },
          },
        },
      ],
    }).compile();
    const svc = moduleRef.get(VisualRankingShadowService);
    const applyOn = readOnboardingVisionApplyEnv({
      PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "1",
    } as NodeJS.ProcessEnv);
    const result = await svc.computeShadow(computeInput, baseEnv, applyOn);
    expect(result.computed).toBe(true);
    if (result.computed) {
      expect(result.shadow.appliedToPool).toBe(false);
      expect(result.shadow.summary.applyToPoolIgnored).toBe(true);
      expect(result.shadow.summary.applyDryRun?.evaluated).toBe(true);
      expect(result.shadow.summary.applyDryRun?.eligible).toBe(false);
      expect(result.shadow.summary.applyDryRun?.reason).toBe(
        "candidate_count_not_six",
      );
    }
  });

  it("P7.5-r5-c1: writerDecision sets summary.applyResult without changing applyDryRun.appliedToPool", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        VisualRankingShadowService,
        {
          provide: PrismaService,
          useValue: {
            userImage: { findMany },
            onboardingPhotoPreviewPoolShadow: { upsert },
          },
        },
      ],
    }).compile();
    const svc = moduleRef.get(VisualRankingShadowService);
    const result = await svc.computeShadow(
      {
        ...computeInput,
        writerDecision: {
          shouldApply: true,
          reason: "ok",
          applySourceVersion: "onboarding-photo-preview-v2-vision",
        },
        eligibility: {
          eligible: true,
          decision: "eligible_dry_run",
          reason: "ok",
          applySourceVersion: "onboarding-photo-preview-v2-vision",
          appliedToPool: false,
        },
      },
      baseEnv,
    );
    expect(result.computed).toBe(true);
    if (result.computed) {
      expect(result.shadow.appliedToPool).toBe(false);
      expect(result.shadow.summary.applyDryRun?.appliedToPool).toBe(false);
      expect(result.shadow.summary.applyResult?.applied).toBe(true);
      expect(result.shadow.summary.applyResult?.reason).toBe("ok");
      expect(result.shadow.summary.applyDryRun?.appliedToPool).toBe(false);
      expect(result.shadow.appliedToPool).toBe(false);
    }
  });

  it("persist failure does not throw from computeShadow", async () => {
    const upsert = jest.fn().mockRejectedValue(new Error("db"));
    const findMany = jest.fn().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        VisualRankingShadowService,
        {
          provide: PrismaService,
          useValue: {
            userImage: { findMany },
            onboardingPhotoPreviewPoolShadow: { upsert },
          },
        },
      ],
    }).compile();
    const svc = moduleRef.get(VisualRankingShadowService);
    await expect(
      svc.computeShadow(computeInput, baseEnv),
    ).resolves.toMatchObject({
      computed: true,
      persist: { persisted: false, reason: "persist_error" },
    });
  });
});
