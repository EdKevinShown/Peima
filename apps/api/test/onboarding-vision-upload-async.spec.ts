import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { ONBOARDING_VISION_SOURCE_RULES_R2 } from "../src/modules/onboarding/vision/onboarding-vision-profile.builder";
import { ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU } from "../src/modules/onboarding/vision/cloud-vision.facade";
import {
  applyVisionSidecarForUpload,
  buildVisionProfileForUploadPersist,
  shouldScheduleCloudVisionAsyncJob,
  shouldUseAsyncCloudVisionPath,
} from "../src/modules/onboarding/vision/onboarding-vision-upload-persist";
import { runUserImageCloudVisionAsyncJob } from "../src/modules/onboarding/vision/user-image-cloud-vision-async-job";
import type { OnboardingVisionProfileV1 } from "../src/modules/onboarding/vision/onboarding-vision.types";

const sampleDetection = {
  quality: { meanLuma: 120, laplacianVariance: 90, width: 800, height: 600 },
  face: { faceCount: 1, faces: [] },
  warnings: [],
  pipeline: ["quality", "face"],
};

function liveZhipuEnv(
  overrides: Partial<ReturnType<typeof readOnboardingVisionEnv>> = {},
) {
  return {
    ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    enabled: true,
    provider: "cloud" as const,
    baseUrl: "https://vision.example.test/v1/chat/completions",
    apiKey: "test-api-key",
    cloudVendor: "zhipu" as const,
    cloudDryRun: false,
    cloudHttpEnabled: true,
    cloudAsync: true,
    cloudAllowlistUserIds: ["user-1"],
    cloudAllowlistImageIds: [],
    ...overrides,
  };
}

describe("onboarding-vision-upload-persist", () => {
  it("shouldUseAsyncCloudVisionPath when cloudAsync and cloud provider", () => {
    expect(
      shouldUseAsyncCloudVisionPath(
        liveZhipuEnv({ cloudAsync: true, provider: "cloud" }),
      ),
    ).toBe(true);
    expect(
      shouldUseAsyncCloudVisionPath(
        liveZhipuEnv({ cloudAsync: false, provider: "cloud" }),
      ),
    ).toBe(false);
    expect(
      shouldUseAsyncCloudVisionPath(
        liveZhipuEnv({ cloudAsync: true, provider: "rules" }),
      ),
    ).toBe(false);
  });

  it("buildVisionProfileForUploadPersist uses rules only when live zhipu deferred", () => {
    const env = liveZhipuEnv();
    const deferred = buildVisionProfileForUploadPersist(sampleDetection, env, {
      userId: "user-1",
    })!;
    expect(deferred.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_RULES_R2);
    expect(deferred.provider).toBe("rules");

    const dryRun = buildVisionProfileForUploadPersist(
      sampleDetection,
      liveZhipuEnv({ cloudDryRun: true }),
      { userId: "user-1" },
    )!;
    expect(dryRun.provider).toBe("cloud");
  });

  it("applyVisionSidecarForUpload defers live cloud with rules placeholder", () => {
    const env = liveZhipuEnv();
    const merged = applyVisionSidecarForUpload(sampleDetection, env, {
      userId: "user-1",
    }) as Record<string, unknown>;
    expect(merged.vision).toBeDefined();
    expect((merged.vision as OnboardingVisionProfileV1).provider).toBe("rules");
  });

  it("shouldScheduleCloudVisionAsyncJob only when real-zhipu gate passes", () => {
    const env = liveZhipuEnv();
    expect(
      shouldScheduleCloudVisionAsyncJob(env, {
        userId: "user-1",
        imageId: "img-1",
      }),
    ).toBe(true);
    expect(
      shouldScheduleCloudVisionAsyncJob(env, {
        userId: "other",
        imageId: "img-1",
      }),
    ).toBe(false);
    expect(
      shouldScheduleCloudVisionAsyncJob(
        liveZhipuEnv({ cloudHttpEnabled: false }),
        { userId: "user-1", imageId: "img-1" },
      ),
    ).toBe(false);
  });
});

describe("runUserImageCloudVisionAsyncJob", () => {
  it("merges async facade result into detectionScoreJson", async () => {
    const env = liveZhipuEnv();
    const cloudProfile: OnboardingVisionProfileV1 = {
      schemaVersion: "onboarding-vision-v1",
      provider: "cloud",
      sourceVersion: ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU,
      photoVisualTaxonomyVersion: "p7.5-v1",
      generatedAt: new Date().toISOString(),
      visionStatus: "ok",
      photoVisualTags: ["outdoor"],
      qualityTags: [],
      sceneTags: [],
      fallbackUsed: false,
      confidence: 0.9,
    };

    const result = await runUserImageCloudVisionAsyncJob(
      {
        userImageId: "img-1",
        userId: "user-1",
        detectionScoreJson: applyVisionSidecarForUpload(sampleDetection, env, {
          userId: "user-1",
        }),
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("fake"),
        },
      },
      {
        env,
        runFacade: async () => cloudProfile,
      },
    );

    expect(result.scheduled).toBe(true);
    if (result.scheduled) {
      const vision = (result.mergedDetectionScoreJson.vision ??
        {}) as OnboardingVisionProfileV1;
      expect(vision.provider).toBe("cloud");
      expect(vision.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU);
      expect(result.mergedDetectionScoreJson.quality).toEqual(
        sampleDetection.quality,
      );
    }
  });

  it("returns not eligible when gate is mock", async () => {
    const env = liveZhipuEnv({ cloudHttpEnabled: false });
    const result = await runUserImageCloudVisionAsyncJob(
      {
        userImageId: "img-1",
        userId: "user-1",
        detectionScoreJson: sampleDetection,
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("x"),
        },
      },
      { env, runFacade: async () => ({}) as OnboardingVisionProfileV1 },
    );
    expect(result).toEqual({ scheduled: false, reason: "async_job_not_eligible" });
  });
});
