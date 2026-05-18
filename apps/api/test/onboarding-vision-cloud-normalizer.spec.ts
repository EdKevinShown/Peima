import {
  normalizeCloudVisionRawResult,
  assertNormalizedVisionHasNoSensitiveFields,
} from "../src/modules/onboarding/vision/cloud-vision-normalizer";
import { stripCloudVisionSensitiveFields } from "../src/modules/onboarding/vision/cloud-vision-sensitive";
import type { CloudVisionRawResult } from "../src/modules/onboarding/vision/cloud-vision.types";

const env = { maxTags: 3 };

describe("normalizeCloudVisionRawResult", () => {
  it("keeps known tags, drops unknown, caps MAX_TAGS", () => {
    const raw: CloudVisionRawResult = {
      vendor: "mock",
      model: "test",
      latencyMs: 0,
      labels: {
        photoVisual: [
          { tag: "清爽自然", score: 0.9 },
          { tag: "生活感", score: 0.8 },
          { tag: "精致感", score: 0.7 },
          { tag: "氛围感", score: 0.6 },
          { tag: "未知气质", score: 0.99 },
        ],
        quality: [{ tag: "清晰", score: 0.8 }],
        scene: [{ tag: "室内日常", score: 0.7 }],
      },
    };
    const n = normalizeCloudVisionRawResult(raw, env);
    expect(n.fallbackNeeded).toBe(false);
    expect(n.photoVisualTags).toEqual(["清爽自然", "生活感", "精致感"]);
    expect(n.warnings).toContain("VISION_CLOUD_UNKNOWN_TAG");
    expect(n.confidence).toBeGreaterThanOrEqual(0.15);
    expect(n.confidence).toBeLessThanOrEqual(0.85);
  });

  it("empty photo tags requests fallback", () => {
    const raw: CloudVisionRawResult = {
      vendor: "mock",
      model: "test",
      latencyMs: 0,
      labels: { photoVisual: [], quality: [], scene: [] },
    };
    const n = normalizeCloudVisionRawResult(raw, env);
    expect(n.fallbackNeeded).toBe(true);
    expect(n.fallbackReason).toBe("cloud_empty_photo_tags");
  });

  it("drops unknown quality and scene tags with warning", () => {
    const raw: CloudVisionRawResult = {
      vendor: "zhipu",
      model: "test",
      latencyMs: 0,
      labels: {
        photoVisual: [{ tag: "清爽自然", score: 0.9 }],
        quality: [
          { tag: "清晰", score: 0.8 },
          { tag: "未知质量", score: 0.99 },
        ],
        scene: [
          { tag: "户外自然", score: 0.7 },
          { tag: "未知场景", score: 0.5 },
        ],
      },
    };
    const n = normalizeCloudVisionRawResult(raw, env);
    expect(n.qualityTags).toEqual(["清晰"]);
    expect(n.sceneTags).toEqual(["户外自然"]);
    expect(n.warnings).toContain("VISION_CLOUD_UNKNOWN_TAG");
  });

  it("photoVisual-only vendor labels normalize without fallback", () => {
    const raw: CloudVisionRawResult = {
      vendor: "zhipu",
      model: "test",
      latencyMs: 0,
      labels: {
        photoVisual: [{ tag: "文艺温柔", score: 0.85 }],
        quality: [],
        scene: [],
      },
    };
    const n = normalizeCloudVisionRawResult(raw, env);
    expect(n.fallbackNeeded).toBe(false);
    expect(n.photoVisualTags).toEqual(["文艺温柔"]);
    expect(n.qualityTags).toEqual([]);
    expect(n.sceneTags).toEqual([]);
  });

  it("refusal requests fallback", () => {
    const raw: CloudVisionRawResult = {
      vendor: "mock",
      model: "test",
      latencyMs: 0,
      labels: { photoVisual: [], quality: [], scene: [] },
      refusal: { code: "X", message: "nope" },
    };
    const n = normalizeCloudVisionRawResult(raw, env);
    expect(n.fallbackNeeded).toBe(true);
    expect(n.fallbackReason).toBe("cloud_refusal");
  });

  it("strips sensitive debug fields", () => {
    const raw = stripCloudVisionSensitiveFields({
      vendor: "mock",
      model: "test",
      latencyMs: 0,
      labels: {
        photoVisual: [{ tag: "清爽自然", score: 0.9 }],
        quality: [],
        scene: [],
      },
      debug: { beautyScore: 9, genderGuess: "x" },
    } as CloudVisionRawResult);
    expect(JSON.stringify(raw)).not.toContain("genderGuess");
    expect(JSON.stringify(raw)).not.toContain("beautyScore");
  });
});

describe("assertNormalizedVisionHasNoSensitiveFields", () => {
  it("throws when sensitive keys appear in profile json", () => {
    expect(() =>
      assertNormalizedVisionHasNoSensitiveFields({ genderGuess: 1 }),
    ).toThrow(/sensitive field leaked/);
  });
});
