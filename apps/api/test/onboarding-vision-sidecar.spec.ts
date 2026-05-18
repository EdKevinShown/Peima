import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { ONBOARDING_VISION_SOURCE_CLOUD_R2 } from "../src/modules/onboarding/vision/cloud-vision.facade";
import {
  ONBOARDING_VISION_SOURCE_PERSIST_FAILED,
  ONBOARDING_VISION_SOURCE_RULES_R2,
  ONBOARDING_VISION_SOURCE_STUB_R2,
} from "../src/modules/onboarding/vision/onboarding-vision-profile.builder";
import { buildOnboardingVisionProfileForPersist } from "../src/modules/onboarding/vision/onboarding-vision-persist";
import * as onboardingVisionRulesProvider from "../src/modules/onboarding/vision/onboarding-vision-rules-provider";
import {
  detectionScoreJsonBase,
  detectionScoreJsonHasVision,
  mergeVisionIntoDetectionScoreJson,
} from "../src/modules/onboarding/vision/onboarding-vision-score-json.merge";
import { applyVisionSidecarToDetectionScoreJson } from "../src/modules/onboarding/vision/onboarding-vision-sidecar";
import { resolveUserImageReviewStateFromDetection } from "../src/modules/images/user-image-review-status";
import type { UserImageDetectionScoreJson } from "../src/modules/images/user-image-quality-detection";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ImagesService } from "../src/modules/images/images.service";
import { UserImageDetectionService } from "../src/modules/images/user-image-detection.service";
import { UserImageVisionSidecarService } from "../src/modules/images/user-image-vision-sidecar.service";
import { UserImageCloudVisionAsyncService } from "../src/modules/images/user-image-cloud-vision-async.service";
import { OnboardingVisionService } from "../src/modules/onboarding/vision/onboarding-vision.service";

const sampleDetection = {
  quality: { meanLuma: 120, laplacianVariance: 90, width: 800, height: 600 },
  face: {
    faceCount: 1,
    faces: [],
    primaryFace: {
      score: 0.9,
      box: { x: 100, y: 80, width: 200, height: 240 },
      areaRatio: 0.08,
      centerDistance: 0.2,
      primaryScore: 0.85,
      index: 0,
    },
  },
  warnings: ["MULTIPLE_FACES"],
  pipeline: ["quality", "face"],
  faceDetectionEnabled: true,
};

function envEnabled(
  overrides: Partial<ReturnType<typeof readOnboardingVisionEnv>> = {},
) {
  return {
    ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    enabled: true,
    provider: "rules" as const,
    ...overrides,
  };
}

describe("mergeVisionIntoDetectionScoreJson", () => {
  it("preserves quality face warnings pipeline", () => {
    const vision = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "stub" }),
    )!;
    const merged = mergeVisionIntoDetectionScoreJson(sampleDetection, vision);
    expect(merged.quality).toEqual(sampleDetection.quality);
    expect(merged.face).toEqual(sampleDetection.face);
    expect(merged.warnings).toEqual(["MULTIPLE_FACES"]);
    expect(merged.pipeline).toEqual(["quality", "face"]);
    expect(merged.vision).toBe(vision);
  });

  it("handles non-object scoreJson", () => {
    const vision = buildOnboardingVisionProfileForPersist(
      null,
      envEnabled({ provider: "stub" }),
    )!;
    const merged = mergeVisionIntoDetectionScoreJson("not-json", vision);
    expect(detectionScoreJsonBase(merged)).toEqual({ vision });
    expect(detectionScoreJsonHasVision(merged)).toBe(true);
  });
});

describe("buildOnboardingVisionProfileForPersist", () => {
  it("returns null when disabled", () => {
    expect(
      buildOnboardingVisionProfileForPersist(sampleDetection, {
        ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
        enabled: false,
      }),
    ).toBeNull();
  });

  it("rules provider uses p7.5-r2-rules sourceVersion", () => {
    const p = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "rules" }),
    )!;
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_RULES_R2);
    expect(p.provider).toBe("rules");
    expect(p.visionStatus).toBe("ok");
  });

  it("stub provider uses p7.5-r2-stub sourceVersion", () => {
    const p = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "stub" }),
    )!;
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_STUB_R2);
    expect(p.provider).toBe("stub");
  });

  it("rules build throw returns persist-failed skipped profile", () => {
    const spy = jest
      .spyOn(onboardingVisionRulesProvider, "buildVisionProfileFromRules")
      .mockImplementation(() => {
        throw new Error("boom");
      });
    const p = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "rules" }),
    )!;
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_PERSIST_FAILED);
    expect(p.visionStatus).toBe("skipped");
    expect(p.warnings).toContain("ONBOARDING_VISION_PERSIST_BUILD_FAILED");
    spy.mockRestore();
  });

  it("zhipu routes to cloud dry-run mock without external HTTP", () => {
    const p = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "zhipu", cloudMockScenario: "normal" }),
    )!;
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_CLOUD_R2);
    expect(p.visionStatus).toBe("ok");
    expect(p.provider).toBe("zhipu");
    expect(p.warnings ?? []).not.toContain(
      "ONBOARDING_VISION_PROVIDER_UNSUPPORTED_IN_R2",
    );
  });
});

describe("applyVisionSidecarToDetectionScoreJson", () => {
  it("disabled leaves json unchanged and no vision key", () => {
    const out = applyVisionSidecarToDetectionScoreJson(sampleDetection, {
      ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
      enabled: false,
    });
    expect(out).toBe(sampleDetection);
    expect(detectionScoreJsonHasVision(out)).toBe(false);
  });

  it("enabled merges vision for rules", () => {
    const out = applyVisionSidecarToDetectionScoreJson(
      sampleDetection,
      envEnabled({ provider: "rules" }),
    ) as Record<string, unknown>;
    expect(detectionScoreJsonHasVision(out)).toBe(true);
    const vision = out.vision as { sourceVersion: string };
    expect(vision.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_RULES_R2);
  });

  it("review gate uses original detection json without vision", () => {
    const withVision = applyVisionSidecarToDetectionScoreJson(
      sampleDetection,
      envEnabled(),
    );
    const reviewFromOriginal = resolveUserImageReviewStateFromDetection({
      detectionStatus: "passed",
      detectionReasonCodes: [],
      detectionScoreJson: sampleDetection,
    });
    const reviewFromMerged = resolveUserImageReviewStateFromDetection({
      detectionStatus: "passed",
      detectionReasonCodes: [],
      detectionScoreJson: withVision as UserImageDetectionScoreJson,
    });
    expect(reviewFromMerged).toEqual(reviewFromOriginal);
  });
});

describe("ImagesService vision sidecar on createFromUpload", () => {
  const baseDetect = {
    status: "passed" as const,
    reasonCodes: [] as string[],
    scoreJson: sampleDetection,
    rulesVersion: "p7.4-r1c-v1",
  };

  async function compileImagesService(env: ReturnType<typeof readOnboardingVisionEnv>) {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "img1",
        userId: data.user.connect.id,
        imageUrl: data.imageUrl,
        detectionStatus: data.detectionStatus,
        reviewStatus: data.reviewStatus,
        reviewReasonCodes: data.reviewReasonCodes,
        detectionScoreJson: data.detectionScoreJson,
      }),
    );
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "u1" }) },
      userImage: { create },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImagesService,
        UserImageVisionSidecarService,
        UserImageCloudVisionAsyncService,
        OnboardingVisionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: UserImageDetectionService,
          useValue: { detectFromBuffer: jest.fn().mockResolvedValue(baseDetect) },
        },
      ],
    }).compile();
    const vision = moduleRef.get(OnboardingVisionService);
    jest.spyOn(vision, "readEnv").mockReturnValue(env);
    return {
      svc: moduleRef.get(ImagesService),
      create,
    };
  }

  it("default disabled does not persist vision key", async () => {
    const { svc, create } = await compileImagesService(
      readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    );
    await svc.createFromUpload(
      "u1",
      { mimetype: "image/jpeg", buffer: Buffer.from("x") } as never,
      "http://localhost:3000",
    );
    const data = create.mock.calls[0][0].data;
    expect(data.detectionScoreJson).toEqual(sampleDetection);
    expect(data.detectionScoreJson.vision).toBeUndefined();
  });

  it("enabled rules persists vision sidecar", async () => {
    const { svc, create } = await compileImagesService(envEnabled());
    await svc.createFromUpload(
      "u1",
      { mimetype: "image/jpeg", buffer: Buffer.from("x") } as never,
      "http://localhost:3000",
    );
    const persisted = create.mock.calls[0][0].data.detectionScoreJson;
    expect(persisted.vision?.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_RULES_R2);
    expect(persisted.quality).toEqual(sampleDetection.quality);
  });

  it("enabled stub persists p7.5-r2-stub", async () => {
    const { svc, create } = await compileImagesService(
      envEnabled({ provider: "stub" }),
    );
    await svc.createFromUpload(
      "u1",
      { mimetype: "image/jpeg", buffer: Buffer.from("x") } as never,
      "http://localhost:3000",
    );
    expect(create.mock.calls[0][0].data.detectionScoreJson.vision.sourceVersion).toBe(
      ONBOARDING_VISION_SOURCE_STUB_R2,
    );
  });

  it("enabled zhipu persists cloud dry-run vision without changing review", async () => {
    const { svc, create } = await compileImagesService(
      envEnabled({ provider: "zhipu", cloudMockScenario: "normal" }),
    );
    await svc.createFromUpload(
      "u1",
      { mimetype: "image/jpeg", buffer: Buffer.from("x") } as never,
      "http://localhost:3000",
    );
    const data = create.mock.calls[0][0].data;
    expect(data.detectionScoreJson.vision.sourceVersion).toBe(
      ONBOARDING_VISION_SOURCE_CLOUD_R2,
    );
    expect(data.detectionScoreJson.vision.visionStatus).toBe("ok");
    expect(data.reviewStatus).toBe("not_required");
  });
});
