import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { resolveCloudVisionAdapter } from "../src/modules/onboarding/vision/cloud-vision.adapter-registry";
import { cloudVisionMockAdapter } from "../src/modules/onboarding/vision/cloud-vision.mock-adapter";
import {
  ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU,
  runCloudVisionFacade,
  runCloudVisionFacadeAsync,
} from "../src/modules/onboarding/vision/cloud-vision.facade";
import { zhipuCloudVisionAdapterForEnv } from "../src/modules/onboarding/vision/cloud-vision.zhipu-adapter";
import type { OnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { PHOTO_VISUAL_TAGS } from "../src/modules/onboarding/vision/onboarding-vision-taxonomy";
import { QUALITY_TAGS, SCENE_TAGS } from "../src/modules/onboarding/vision/onboarding-vision-quality-scene-taxonomy";

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
    model: "glm-test",
    cloudDryRun: false,
    cloudHttpEnabled: true,
    cloudVendor: "zhipu",
    cloudAllowlistImageIds: ["img-live"],
    cloudAllowlistUserIds: [],
    cloudMockScenario: "normal",
    ...overrides,
  };
}

function mockFetchOk(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "req-1" },
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              labels: {
                photoVisual: [{ tag: "清爽自然", score: 0.9 }],
                quality: [{ tag: "清晰", score: 0.8 }],
                scene: [{ tag: "室内日常", score: 0.7 }],
              },
            }),
          },
        },
      ],
    }),
  } as unknown as Response);
}

describe("cloud live gate + HTTP", () => {
  let mockAnalyzeSync: jest.SpyInstance;

  beforeEach(() => {
    mockAnalyzeSync = jest.spyOn(cloudVisionMockAdapter, "analyzeSync");
  });

  afterEach(() => {
    mockAnalyzeSync.mockRestore();
  });

  it("default env does not call fetch", async () => {
    const fetchMock = mockFetchOk();
    await runCloudVisionFacadeAsync(
      { detectionScoreJson: sampleDetection, imageId: "x" },
      readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
      { httpFetch: fetchMock },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CLOUD_HTTP_ENABLED=0 does not call fetch", async () => {
    const fetchMock = mockFetchOk();
    await runCloudVisionFacadeAsync(
      { detectionScoreJson: sampleDetection, imageId: "img-live" },
      liveReadyEnv({ cloudHttpEnabled: false }),
      { httpFetch: fetchMock },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CLOUD_DRY_RUN=1 does not call fetch", async () => {
    const fetchMock = mockFetchOk();
    await runCloudVisionFacadeAsync(
      { detectionScoreJson: sampleDetection, imageId: "img-live" },
      liveReadyEnv({ cloudDryRun: true }),
      { httpFetch: fetchMock },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockAnalyzeSync).toHaveBeenCalled();
  });

  it("missing API_KEY does not call fetch", async () => {
    const fetchMock = mockFetchOk();
    await runCloudVisionFacadeAsync(
      { detectionScoreJson: sampleDetection, imageId: "img-live" },
      liveReadyEnv({ apiKey: "" }),
      { httpFetch: fetchMock },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowlist miss does not call fetch", async () => {
    const fetchMock = mockFetchOk();
    await runCloudVisionFacadeAsync(
      { detectionScoreJson: sampleDetection, imageId: "other" },
      liveReadyEnv(),
      { httpFetch: fetchMock },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("live allowlist + zhipu calls mocked HTTP once", async () => {
    const fetchMock = mockFetchOk();
    const p = await runCloudVisionFacadeAsync(
      {
        detectionScoreJson: sampleDetection,
        imageId: "img-live",
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("img"),
        },
      },
      liveReadyEnv(),
      { httpFetch: fetchMock, routedFrom: "cloud" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(p.fallbackUsed).toBe(false);
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU);
    expect(p.photoVisualTags).toContain("清爽自然");
    expect(p.qualityTags).toContain("清晰");
    expect(p.sceneTags).toContain("室内日常");
    const json = JSON.stringify(p);
    expect(json).not.toContain("test-api-key");
    expect(json).not.toContain("vision.example.test");
  });

  it("legacy zhipu provider uses same gate and mocked HTTP", async () => {
    const fetchMock = mockFetchOk();
    const r = resolveCloudVisionAdapter(
      liveReadyEnv({ provider: "zhipu" }),
      { imageId: "img-live" },
    );
    expect(r.adapter).toBe("real-zhipu");
    const p = await runCloudVisionFacadeAsync(
      {
        detectionScoreJson: sampleDetection,
        imageId: "img-live",
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("x"),
        },
      },
      liveReadyEnv({ provider: "zhipu" }),
      { httpFetch: fetchMock, routedFrom: "zhipu" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(p.provider).toBe("zhipu");
  });

  it("invalid JSON from vendor falls back to rules", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: "not-json" } }] }),
    } as unknown as Response);
    const p = await runCloudVisionFacadeAsync(
      {
        detectionScoreJson: sampleDetection,
        imageId: "img-live",
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("x"),
        },
      },
      liveReadyEnv(),
      { httpFetch: fetchMock },
    );
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("cloud_zhipu_parse_error");
    expect(p.photoVisualTags.length).toBeGreaterThan(0);
  });

  it.each([
    [400, "cloud_zhipu_http_400"],
    [401, "cloud_zhipu_http_401"],
    [403, "cloud_zhipu_http_403"],
    [404, "cloud_zhipu_http_404"],
    [429, "cloud_zhipu_http_429"],
    [500, "cloud_zhipu_http_5xx"],
  ])(
    "live HTTP %i falls back with %s",
    async (status, fallbackReason) => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status,
        headers: { get: () => null },
        json: async () => ({ error: "vendor" }),
      } as unknown as Response);
      const p = await runCloudVisionFacadeAsync(
        {
          detectionScoreJson: sampleDetection,
          imageId: "img-live",
          imageRef: {
            kind: "bytes",
            mimeType: "image/jpeg",
            buffer: Buffer.from("x"),
          },
        },
        liveReadyEnv(),
        { httpFetch: fetchMock },
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(p.fallbackUsed).toBe(true);
      expect(p.fallbackReason).toBe(fallbackReason);
      expect(p.sourceVersion).toBe("p7.5-r7-cloud-dry-run-v1");
    },
  );

  it("live timeout falls back with cloud_zhipu_timeout", async () => {
    const fetchMock = jest.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    const p = await runCloudVisionFacadeAsync(
      {
        detectionScoreJson: sampleDetection,
        imageId: "img-live",
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("x"),
        },
      },
      liveReadyEnv({ timeoutMs: 10 }),
      { httpFetch: fetchMock },
    );
    expect(p.fallbackReason).toBe("cloud_zhipu_timeout");
    expect(p.fallbackUsed).toBe(true);
  });

  it("live invalid JSON body falls back with cloud_zhipu_invalid_json", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);
    const p = await runCloudVisionFacadeAsync(
      {
        detectionScoreJson: sampleDetection,
        imageId: "img-live",
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("x"),
        },
      },
      liveReadyEnv(),
      { httpFetch: fetchMock },
    );
    expect(p.fallbackReason).toBe("cloud_zhipu_invalid_json");
  });

  it("sync facade with live gate does not call fetch", async () => {
    const fetchMock = mockFetchOk();
    const p = runCloudVisionFacade(
      {
        detectionScoreJson: sampleDetection,
        imageId: "img-live",
        imageRef: {
          kind: "bytes",
          mimeType: "image/jpeg",
          buffer: Buffer.from("x"),
        },
      },
      liveReadyEnv(),
      { httpFetch: fetchMock },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("cloud_live_requires_async");
  });

  it("zhipu adapter alone never uses global fetch when mock injected", async () => {
    const fetchMock = mockFetchOk();
    const adapter = zhipuCloudVisionAdapterForEnv(liveReadyEnv(), fetchMock);
    await adapter.analyze({
      taxonomyHints: {
        photoVisual: PHOTO_VISUAL_TAGS,
        quality: QUALITY_TAGS,
        scene: SCENE_TAGS,
      },
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(fetchMock).toHaveBeenCalled();
    if (typeof globalThis.fetch === "function") {
      const globalSpy = jest.spyOn(globalThis, "fetch");
      expect(globalSpy).not.toHaveBeenCalled();
      globalSpy.mockRestore();
    }
  });
});
