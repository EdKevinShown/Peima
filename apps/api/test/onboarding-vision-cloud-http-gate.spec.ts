import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { cloudVisionMockAdapter } from "../src/modules/onboarding/vision/cloud-vision.mock-adapter";
import { runCloudVisionFacade } from "../src/modules/onboarding/vision/cloud-vision.facade";
import { buildVisionProfileFromCloud } from "../src/modules/onboarding/vision/onboarding-vision-cloud-provider";
import { buildVisionProfileFromRules } from "../src/modules/onboarding/vision/onboarding-vision-rules-provider";
import { buildVisionProfileFromStub } from "../src/modules/onboarding/vision/onboarding-vision-stub-provider";
import type { OnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";

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
  warnings: [],
  pipeline: ["quality", "face"],
  faceDetectionEnabled: true,
};

function liveReadyEnv(
  overrides: Partial<OnboardingVisionEnv> = {},
): OnboardingVisionEnv {
  return {
    ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    enabled: true,
    provider: "cloud",
    baseUrl: "https://vision.example.test/v1/chat/completions",
    apiKey: "test-api-key",
    cloudDryRun: false,
    cloudHttpEnabled: true,
    cloudVendor: "zhipu",
    cloudAllowlistImageIds: ["img-live"],
    cloudAllowlistUserIds: [],
    cloudMockScenario: "normal",
    ...overrides,
  };
}

describe("cloud vision HTTP gate (sync facade)", () => {
  let mockAnalyzeSync: jest.SpyInstance;

  beforeEach(() => {
    mockAnalyzeSync = jest.spyOn(cloudVisionMockAdapter, "analyzeSync");
  });

  afterEach(() => {
    mockAnalyzeSync.mockRestore();
  });

  it("sync live gate falls back without mock or HTTP", () => {
    const p = runCloudVisionFacade(
      { detectionScoreJson: sampleDetection, imageId: "img-live" },
      liveReadyEnv(),
      { routedFrom: "cloud" },
    );

    expect(mockAnalyzeSync).not.toHaveBeenCalled();
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("cloud_live_requires_async");
    expect(p.warnings).toEqual(
      expect.arrayContaining([
        "VISION_CLOUD_LIVE_REQUIRES_ASYNC",
        "VISION_CLOUD_FALLBACK_RULES",
      ]),
    );
    expect(p.photoVisualTags.length).toBeGreaterThan(0);
  });

  it("legacy zhipu sync path requires async", () => {
    const p = buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection, imageId: "img-live" },
      liveReadyEnv({ provider: "zhipu" }),
    );
    expect(mockAnalyzeSync).not.toHaveBeenCalled();
    expect(p.provider).toBe("zhipu");
    expect(p.fallbackReason).toBe("cloud_live_requires_async");
  });

  it("dry-run still uses mock adapter", () => {
    buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection, imageId: "img-live" },
      liveReadyEnv({ cloudDryRun: true }),
    );
    expect(mockAnalyzeSync).toHaveBeenCalled();
  });
});

describe("rules/stub unchanged under HTTP gate work", () => {
  it("rules provider unchanged", () => {
    const p = buildVisionProfileFromRules(
      { detectionScoreJson: sampleDetection },
      readOnboardingVisionEnv({
        PEIMA_ONBOARDING_VISION_ENABLED: "1",
      } as NodeJS.ProcessEnv),
    );
    expect(p.provider).toBe("rules");
    expect(p.visionStatus).toBe("ok");
  });

  it("stub provider unchanged", () => {
    const p = buildVisionProfileFromStub(
      {},
      readOnboardingVisionEnv({
        PEIMA_ONBOARDING_VISION_ENABLED: "1",
      } as NodeJS.ProcessEnv),
    );
    expect(p.provider).toBe("stub");
    expect(p.photoVisualTags).toEqual(["生活感", "简约干净", "清爽自然"]);
  });
});
