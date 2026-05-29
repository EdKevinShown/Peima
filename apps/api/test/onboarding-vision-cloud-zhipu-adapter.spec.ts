import type { OnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { PHOTO_VISUAL_TAGS } from "../src/modules/onboarding/vision/onboarding-vision-taxonomy";
import { QUALITY_TAGS, SCENE_TAGS } from "../src/modules/onboarding/vision/onboarding-vision-quality-scene-taxonomy";
import {
  ZhipuCloudVisionAdapter,
} from "../src/modules/onboarding/vision/cloud-vision.zhipu-adapter";
import { zhipuHttpErrorCodeFromStatus } from "../src/modules/onboarding/vision/cloud-vision.zhipu-error-codes";
import type { CloudVisionHttpFetch } from "../src/modules/onboarding/vision/cloud-vision.http-client";

function zhipuEnv(overrides: Partial<OnboardingVisionEnv> = {}): OnboardingVisionEnv {
  return {
    enabled: true,
    provider: "cloud",
    baseUrl: "https://vision.example.test/v1/chat/completions",
    apiKey: "test-key",
    model: "glm-vision-test",
    timeoutMs: 5000,
    cacheTtlMs: 86400000,
    maxTags: 6,
    shadowEnabled: true,
    cloudVendor: "zhipu",
    cloudDryRun: false,
    cloudAsync: true,
    cloudMaxConcurrency: 4,
    cloudMockScenario: "normal",
    cloudHttpEnabled: true,
    cloudAllowlistImageIds: ["img-1"],
    cloudAllowlistUserIds: [],
    cloudRetry: 0,
    ...overrides,
  };
}

const taxonomyHints = {
  photoVisual: PHOTO_VISUAL_TAGS,
  quality: QUALITY_TAGS,
  scene: SCENE_TAGS,
};

function mockFetchResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("ZhipuCloudVisionAdapter", () => {
  it("fail closed without baseUrl", async () => {
    const fetchMock = jest.fn();
    const adapter = new ZhipuCloudVisionAdapter(
      zhipuEnv({ baseUrl: "" }),
      fetchMock,
    );
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raw.refusal?.code).toBe("missing_base_url");
  });

  it("fail closed without apiKey", async () => {
    const fetchMock = jest.fn();
    const adapter = new ZhipuCloudVisionAdapter(
      zhipuEnv({ apiKey: "" }),
      fetchMock,
    );
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raw.refusal?.code).toBe("missing_api_key");
  });

  it("200 JSON returns labels", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue(
      mockFetchResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                labels: {
                  photoVisual: [{ tag: "清爽自然", score: 0.88 }],
                  quality: [{ tag: "清晰", score: 0.7 }],
                  scene: [{ tag: "室内日常", score: 0.65 }],
                },
              }),
            },
          },
        ],
      }),
    );
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("jpeg-bytes"),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://vision.example.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    const bodyStr = String(init.body);
    expect(bodyStr).not.toContain("test-key");
    expect(bodyStr).not.toContain("jpeg-bytes");
    expect(raw.labels.photoVisual[0]?.tag).toBe("清爽自然");
    expect(raw.labels.quality[0]?.tag).toBe("清晰");
    expect(raw.labels.scene[0]?.tag).toBe("室内日常");
    expect(raw.vendor).toBe("zhipu");
  });

  it("photoVisual-only vendor JSON parses with empty quality/scene", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue(
      mockFetchResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                labels: {
                  photoVisual: [{ tag: "文艺温柔", score: 0.9 }],
                },
              }),
            },
          },
        ],
      }),
    );
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(raw.refusal).toBeUndefined();
    expect(raw.labels.photoVisual[0]?.tag).toBe("文艺温柔");
    expect(raw.labels.quality).toEqual([]);
    expect(raw.labels.scene).toEqual([]);
  });

  it("invalid JSON body returns refusal", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(raw.refusal?.code).toBe("invalid_json");
  });

  it.each([
    [400, "http_400"],
    [401, "http_401"],
    [403, "http_403"],
    [404, "http_404"],
    [429, "http_429"],
    [500, "http_5xx"],
    [502, "http_5xx"],
    [503, "http_5xx"],
    [418, "http_418"],
  ])("HTTP %i maps to refusal code %s", async (status, code) => {
    expect(zhipuHttpErrorCodeFromStatus(status)).toBe(code);
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue(
      mockFetchResponse(status, { error: "vendor" }),
    );
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(raw.refusal?.code).toBe(code);
    expect(raw.refusal?.message).toBe(`status=${status}`);
  });

  it("413 maps to http_413", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue(
      mockFetchResponse(413, {}),
    );
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(raw.refusal?.code).toBe("http_413");
  });

  it("parse failure maps to parse_error", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue(
      mockFetchResponse(200, {
        choices: [{ message: { content: "not-json" } }],
      }),
    );
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(raw.refusal?.code).toBe("parse_error");
  });

  it("timeout abort returns timeout refusal", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    const adapter = new ZhipuCloudVisionAdapter(
      zhipuEnv({ timeoutMs: 10 }),
      fetchMock,
    );
    const raw = await adapter.analyze({
      taxonomyHints,
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    expect(raw.refusal?.code).toBe("timeout");
  });

  it("prompt does not include blocked PII field names", async () => {
    const fetchMock: CloudVisionHttpFetch = jest.fn().mockResolvedValue(
      mockFetchResponse(200, {
        labels: {
          photoVisual: [{ tag: "生活感", score: 0.7 }],
          quality: [],
          scene: [],
        },
      }),
    );
    const adapter = new ZhipuCloudVisionAdapter(zhipuEnv(), fetchMock);
    await adapter.analyze({
      taxonomyHints,
      imageId: "must-not-appear-in-prompt",
      viewerStyleTags: ["清爽自然"],
      imageRef: {
        kind: "bytes",
        mimeType: "image/jpeg",
        buffer: Buffer.from("x"),
      },
    });
    const body = JSON.parse(String((fetchMock as jest.Mock).mock.calls[0][1].body));
    const text = JSON.stringify(body);
    expect(text).not.toContain("must-not-appear-in-prompt");
    expect(text).not.toContain("reviewNote");
    expect(text).not.toContain("genderGuess");
    expect(text).not.toContain("User.gender");
  });
});
