/**
 * P7.5-r7-c1: Zhipu / OpenAI-compatible vision adapter (HTTP via env baseUrl).
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { parseCloudVisionVendorResponse } from "./cloud-vision.response-parser";
import {
  defaultCloudVisionHttpFetch,
  type CloudVisionHttpFetch,
} from "./cloud-vision.http-client";
import { zhipuHttpErrorCodeFromStatus } from "./cloud-vision.zhipu-error-codes";
import { buildZhipuCloudVisionPrompt } from "./cloud-vision.zhipu-prompt";
import type {
  CloudVisionAdapter,
  CloudVisionAnalyzeInput,
  CloudVisionImageRef,
  CloudVisionRawResult,
} from "./cloud-vision.types";

export const CLOUD_VISION_ZHIPU_VENDOR = "zhipu" as const;
export const CLOUD_VISION_ZHIPU_MODEL_FALLBACK = "p7.5-r7-cloud-zhipu-v1" as const;

export type ZhipuCloudVisionAdapterErrorCode =
  | "missing_base_url"
  | "missing_api_key"
  | "missing_image_ref"
  | "timeout"
  | "network"
  | "invalid_json"
  | "parse_error"
  | "refusal"
  | "http_400"
  | "http_401"
  | "http_403"
  | "http_404"
  | "http_413"
  | "http_429"
  | "http_5xx"
  | `http_${number}`;

export class ZhipuCloudVisionAdapterError extends Error {
  readonly code: ZhipuCloudVisionAdapterErrorCode | string;

  constructor(code: ZhipuCloudVisionAdapterErrorCode | string, message?: string) {
    super(message ?? code);
    this.name = "ZhipuCloudVisionAdapterError";
    this.code = code;
  }
}

function imageRefToMessagePart(
  imageRef: CloudVisionImageRef,
): Record<string, unknown> {
  if (imageRef.kind === "signedUrl") {
    return {
      type: "image_url",
      image_url: { url: imageRef.url },
    };
  }
  const b64 = imageRef.buffer.toString("base64");
  return {
    type: "image_url",
    image_url: {
      url: `data:${imageRef.mimeType || "image/jpeg"};base64,${b64}`,
    },
  };
}

export class ZhipuCloudVisionAdapter implements CloudVisionAdapter {
  constructor(
    private readonly env: OnboardingVisionEnv,
    private readonly httpFetch: CloudVisionHttpFetch = defaultCloudVisionHttpFetch(),
  ) {}

  async analyze(input: CloudVisionAnalyzeInput): Promise<CloudVisionRawResult> {
    const started = Date.now();
    try {
      return await this.analyzeInternal(input, started);
    } catch (err) {
      if (err instanceof ZhipuCloudVisionAdapterError) {
        return this.errorResult(err, started);
      }
      const code: ZhipuCloudVisionAdapterErrorCode =
        err instanceof Error && err.name === "AbortError"
          ? "timeout"
          : "network";
      return this.errorResult(
        new ZhipuCloudVisionAdapterError(code, err instanceof Error ? err.message : undefined),
        started,
      );
    }
  }

  private async analyzeInternal(
    input: CloudVisionAnalyzeInput,
    started: number,
  ): Promise<CloudVisionRawResult> {
    const baseUrl = this.env.baseUrl.trim();
    const apiKey = this.env.apiKey.trim();
    if (!baseUrl) {
      throw new ZhipuCloudVisionAdapterError("missing_base_url");
    }
    if (!apiKey) {
      throw new ZhipuCloudVisionAdapterError("missing_api_key");
    }
    if (!input.imageRef) {
      throw new ZhipuCloudVisionAdapterError("missing_image_ref");
    }

    const model = this.env.model.trim() || CLOUD_VISION_ZHIPU_MODEL_FALLBACK;
    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildZhipuCloudVisionPrompt(input) },
            imageRefToMessagePart(input.imageRef),
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 800,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.timeoutMs);
    const fetchFn = this.httpFetch;

    let response: Response;
    try {
      response = await fetchFn(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      throw new ZhipuCloudVisionAdapterError(
        zhipuHttpErrorCodeFromStatus(response.status),
        `status=${response.status}`,
      );
    }

    let jsonBody: unknown;
    try {
      jsonBody = await response.json();
    } catch {
      throw new ZhipuCloudVisionAdapterError("invalid_json");
    }

    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("request-id") ??
      undefined;

    const parsed = parseCloudVisionVendorResponse(jsonBody, { requestId });
    if (!parsed.ok) {
      throw new ZhipuCloudVisionAdapterError("parse_error", parsed.reason);
    }

    if (parsed.refusal) {
      return {
        vendor: CLOUD_VISION_ZHIPU_VENDOR,
        model,
        latencyMs,
        requestId: parsed.requestId,
        labels: parsed.labels,
        refusal: parsed.refusal,
      };
    }

    return {
      vendor: CLOUD_VISION_ZHIPU_VENDOR,
      model,
      latencyMs,
      requestId: parsed.requestId,
      labels: parsed.labels,
    };
  }

  private errorResult(
    err: ZhipuCloudVisionAdapterError,
    started: number,
  ): CloudVisionRawResult {
    return {
      vendor: CLOUD_VISION_ZHIPU_VENDOR,
      model: this.env.model.trim() || CLOUD_VISION_ZHIPU_MODEL_FALLBACK,
      latencyMs: Date.now() - started,
      labels: { photoVisual: [], quality: [], scene: [] },
      refusal: {
        code: err.code,
        message: err.message,
      },
    };
  }
}

export const zhipuCloudVisionAdapterForEnv = (
  env: OnboardingVisionEnv,
  httpFetch?: CloudVisionHttpFetch,
): ZhipuCloudVisionAdapter => new ZhipuCloudVisionAdapter(env, httpFetch);
