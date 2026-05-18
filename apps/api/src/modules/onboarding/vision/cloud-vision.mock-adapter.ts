/**
 * P7.5-r7-b: deterministic mock cloud adapter (no HTTP).
 */

import type {
  CloudVisionAdapter,
  CloudVisionAnalyzeInput,
  CloudVisionMockScenario,
  CloudVisionRawResult,
} from "./cloud-vision.types";

export const CLOUD_VISION_MOCK_VENDOR = "mock" as const;
export const CLOUD_VISION_MOCK_MODEL = "p7.5-r7-cloud-mock-v1" as const;

export class CloudVisionMockTimeoutError extends Error {
  constructor() {
    super("VISION_CLOUD_MOCK_TIMEOUT");
    this.name = "CloudVisionMockTimeoutError";
  }
}

export function resolveCloudVisionMockScenario(
  input: CloudVisionAnalyzeInput,
): CloudVisionMockScenario {
  const fromInput = input.mockScenario?.trim();
  if (fromInput) return fromInput as CloudVisionMockScenario;
  const fromImageId = input.imageId?.trim();
  if (fromImageId?.startsWith("mock-scenario:")) {
    return fromImageId.slice("mock-scenario:".length) as CloudVisionMockScenario;
  }
  return "normal";
}

export class CloudVisionMockAdapter implements CloudVisionAdapter {
  analyzeSync(input: CloudVisionAnalyzeInput): CloudVisionRawResult {
    return this.buildRawResult(input);
  }

  async analyze(input: CloudVisionAnalyzeInput): Promise<CloudVisionRawResult> {
    return this.buildRawResult(input);
  }

  private buildRawResult(input: CloudVisionAnalyzeInput): CloudVisionRawResult {
    const scenario = resolveCloudVisionMockScenario(input);

    if (scenario === "timeout") {
      throw new CloudVisionMockTimeoutError();
    }

    const base: CloudVisionRawResult = {
      vendor: CLOUD_VISION_MOCK_VENDOR,
      model: CLOUD_VISION_MOCK_MODEL,
      latencyMs: 0,
      requestId: "mock-request-0",
      labels: {
        photoVisual: [],
        quality: [],
        scene: [],
      },
    };

    if (scenario === "refusal") {
      return {
        ...base,
        refusal: {
          code: "POLICY_REFUSAL",
          message: "mock refusal",
        },
      };
    }

    if (scenario === "empty") {
      return base;
    }

    if (scenario === "invalidTag") {
      return {
        ...base,
        labels: {
          photoVisual: [
            { tag: "清爽自然", score: 0.9 },
            { tag: "未知气质标签", score: 0.88 },
            { tag: "颜值超高", score: 0.99 },
          ],
          quality: [{ tag: "清晰", score: 0.7 }, { tag: "genderGuess", score: 1 }],
          scene: [{ tag: "室内日常", score: 0.6 }],
        },
        debug: {
          beautyScore: 9.9,
          genderGuess: "female",
        },
      };
    }

    return {
      ...base,
      labels: {
        photoVisual: [
          { tag: "清爽自然", score: 0.82 },
          { tag: "生活感", score: 0.74 },
          { tag: "简约干净", score: 0.68 },
        ],
        quality: [
          { tag: "清晰", score: 0.8 },
          { tag: "光线明亮", score: 0.72 },
        ],
        scene: [{ tag: "室内日常", score: 0.77 }],
      },
    };
  }
}

export const cloudVisionMockAdapter = new CloudVisionMockAdapter();
