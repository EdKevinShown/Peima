/**
 * P7.5-r7-b/c0/c1: cloud vision facade — mock / real-zhipu / fallback, never throws.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { resolveCloudVisionAdapter } from "./cloud-vision.adapter-registry";
import {
  assembleOnboardingVisionProfile,
  clampConfidence,
} from "./onboarding-vision-profile.builder";
import { buildVisionProfileFromRules } from "./onboarding-vision-rules-provider";
import { PHOTO_VISUAL_TAGS } from "./onboarding-vision-taxonomy";
import {
  QUALITY_TAGS,
  QUALITY_TAXONOMY_VERSION,
  SCENE_TAGS,
  SCENE_TAXONOMY_VERSION,
} from "./onboarding-vision-quality-scene-taxonomy";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";
import type {
  CloudVisionAnalyzeInput,
  CloudVisionMockScenario,
  CloudVisionRawResult,
} from "./cloud-vision.types";
import {
  defaultCloudVisionHttpFetch,
  type CloudVisionHttpFetch,
} from "./cloud-vision.http-client";
import { cloudVisionMockAdapter } from "./cloud-vision.mock-adapter";
import {
  assertNormalizedVisionHasNoSensitiveFields,
  normalizeCloudVisionRawResult,
} from "./cloud-vision-normalizer";
import { stripCloudVisionSensitiveFields } from "./cloud-vision-sensitive";
import { zhipuCloudVisionAdapterForEnv } from "./cloud-vision.zhipu-adapter";
import { zhipuCloudVisionFallbackReasonFromRefusalCode } from "./cloud-vision.zhipu-error-codes";

export const ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN =
  "p7.5-r7-cloud-dry-run-v1" as const;
export const ONBOARDING_VISION_SOURCE_CLOUD_MOCK =
  "p7.5-r7-cloud-mock-v1" as const;
export const ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU =
  "p7.5-r7-cloud-zhipu-v1" as const;
export const ONBOARDING_VISION_SOURCE_CLOUD_R2 =
  ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN;

export type CloudVisionFacadeInput = {
  detectionScoreJson?: unknown;
  viewerStyleTags?: string[];
  imageRef?: CloudVisionAnalyzeInput["imageRef"];
  imageId?: string;
  userId?: string;
  mockScenario?: CloudVisionMockScenario;
};

export type CloudVisionFacadeOptions = {
  sourceVersion?: string;
  routedFrom?: "cloud" | "zhipu";
  httpFetch?: CloudVisionHttpFetch;
};

function buildTaxonomyHints(): CloudVisionAnalyzeInput["taxonomyHints"] {
  return {
    photoVisual: PHOTO_VISUAL_TAGS,
    quality: QUALITY_TAGS,
    scene: SCENE_TAGS,
  };
}

function mergeCloudFallbackWithRules(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options?: CloudVisionFacadeOptions & {
    fallbackReason?: string;
    cloudWarnings?: string[];
  },
): OnboardingVisionProfileV1 {
  const rules = buildVisionProfileFromRules(
    {
      detectionScoreJson: input.detectionScoreJson,
      viewerStyleTags: input.viewerStyleTags,
    },
    env,
    { sourceVersion: options?.sourceVersion },
  );

  const provider = options?.routedFrom === "zhipu" ? "zhipu" : "cloud";
  const warnings = [
    ...(rules.warnings ?? []),
    ...(options?.cloudWarnings ?? ["VISION_CLOUD_FALLBACK_RULES"]),
  ];

  return {
    ...rules,
    provider,
    sourceVersion:
      options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN,
    fallbackUsed: true,
    fallbackReason: options?.fallbackReason ?? "cloud_fallback",
    visionStatus: rules.visionStatus,
    warnings: [...new Set(warnings)],
  };
}

function profileFromNormalizedRaw(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  raw: CloudVisionRawResult,
  options: CloudVisionFacadeOptions | undefined,
  gateWarnings: string[],
  sourceVersion: string,
): OnboardingVisionProfileV1 {
  const normalized = normalizeCloudVisionRawResult(raw, env);

  if (normalized.fallbackNeeded) {
    return mergeCloudFallbackWithRules(input, env, {
      ...options,
      fallbackReason: normalized.fallbackReason ?? "cloud_fallback",
      cloudWarnings: [
        ...gateWarnings,
        ...normalized.warnings,
        "VISION_CLOUD_FALLBACK_RULES",
      ],
    });
  }

  const provider = options?.routedFrom === "zhipu" ? "zhipu" : "cloud";
  const profile = assembleOnboardingVisionProfile(
    {
      provider,
      sourceVersion,
      visionStatus: "ok",
      fallbackUsed: false,
      photoVisualTags: normalized.photoVisualTags,
      qualityTags: normalized.qualityTags,
      sceneTags: normalized.sceneTags,
      qualityTaxonomyVersion: QUALITY_TAXONOMY_VERSION,
      sceneTaxonomyVersion: SCENE_TAXONOMY_VERSION,
      confidence: clampConfidence(normalized.confidence),
      warnings: [...gateWarnings, ...normalized.warnings],
      rawProviderMeta: {
        requestId: raw.requestId,
        latencyMs: raw.latencyMs,
      },
    },
    env,
  );
  assertNormalizedVisionHasNoSensitiveFields(
    profile as unknown as Record<string, unknown>,
  );
  return profile;
}

function runMockCloudVisionPipeline(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options: CloudVisionFacadeOptions | undefined,
  gateWarnings: string[],
): OnboardingVisionProfileV1 {
  const analyzeInput: CloudVisionAnalyzeInput = {
    imageRef: input.imageRef,
    imageId: input.imageId,
    taxonomyHints: buildTaxonomyHints(),
    viewerStyleTags: input.viewerStyleTags,
    locale: "zh-CN",
    mockScenario: input.mockScenario ?? env.cloudMockScenario,
  };

  const raw = stripCloudVisionSensitiveFields(
    cloudVisionMockAdapter.analyzeSync(analyzeInput),
  );
  return profileFromNormalizedRaw(
    input,
    env,
    raw,
    options,
    gateWarnings,
    options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN,
  );
}

async function runRealZhipuCloudVisionPipeline(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options: CloudVisionFacadeOptions | undefined,
  gateWarnings: string[],
): Promise<OnboardingVisionProfileV1> {
  const analyzeInput: CloudVisionAnalyzeInput = {
    imageRef: input.imageRef,
    imageId: input.imageId,
    taxonomyHints: buildTaxonomyHints(),
    viewerStyleTags: input.viewerStyleTags,
    locale: "zh-CN",
  };

  const httpFetch = options?.httpFetch ?? defaultCloudVisionHttpFetch();
  const adapter = zhipuCloudVisionAdapterForEnv(env, httpFetch);
  const raw = stripCloudVisionSensitiveFields(await adapter.analyze(analyzeInput));

  if (raw.refusal) {
    return mergeCloudFallbackWithRules(input, env, {
      ...options,
      fallbackReason: zhipuCloudVisionFallbackReasonFromRefusalCode(
        String(raw.refusal.code),
      ),
      cloudWarnings: [
        ...gateWarnings,
        "VISION_CLOUD_ZHIPU_REFUSAL",
        "VISION_CLOUD_FALLBACK_RULES",
      ],
    });
  }

  return profileFromNormalizedRaw(
    input,
    env,
    raw,
    options,
    gateWarnings,
    ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU,
  );
}

async function runCloudVisionPipelineAsync(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options?: CloudVisionFacadeOptions,
): Promise<OnboardingVisionProfileV1> {
  try {
    const resolution = resolveCloudVisionAdapter(env, {
      imageId: input.imageId,
      userId: input.userId,
      routedFrom: options?.routedFrom,
    });

    if (resolution.adapter === "real-disabled") {
      return mergeCloudFallbackWithRules(input, env, {
        ...options,
        fallbackReason: "cloud_vendor_unsupported",
        cloudWarnings: [
          ...resolution.warnings,
          "VISION_CLOUD_FALLBACK_RULES",
        ],
      });
    }

    if (resolution.adapter === "real-zhipu") {
      return await runRealZhipuCloudVisionPipeline(
        input,
        env,
        options,
        resolution.warnings,
      );
    }

    return runMockCloudVisionPipeline(
      input,
      env,
      options,
      resolution.warnings,
    );
  } catch {
    return mergeCloudFallbackWithRules(input, env, {
      ...options,
      fallbackReason: "cloud_exception",
      cloudWarnings: ["VISION_CLOUD_EXCEPTION", "VISION_CLOUD_FALLBACK_RULES"],
    });
  }
}

function runCloudVisionPipelineSync(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options?: CloudVisionFacadeOptions,
): OnboardingVisionProfileV1 {
  try {
    const resolution = resolveCloudVisionAdapter(env, {
      imageId: input.imageId,
      userId: input.userId,
      routedFrom: options?.routedFrom,
    });

    if (resolution.adapter === "real-disabled") {
      return mergeCloudFallbackWithRules(input, env, {
        ...options,
        fallbackReason: "cloud_vendor_unsupported",
        cloudWarnings: [
          ...resolution.warnings,
          "VISION_CLOUD_FALLBACK_RULES",
        ],
      });
    }

    if (resolution.adapter === "real-zhipu") {
      return mergeCloudFallbackWithRules(input, env, {
        ...options,
        fallbackReason: "cloud_live_requires_async",
        cloudWarnings: [
          ...resolution.warnings,
          "VISION_CLOUD_LIVE_REQUIRES_ASYNC",
          "VISION_CLOUD_FALLBACK_RULES",
        ],
      });
    }

    return runMockCloudVisionPipeline(
      input,
      env,
      options,
      resolution.warnings,
    );
  } catch {
    return mergeCloudFallbackWithRules(input, env, {
      ...options,
      fallbackReason: "cloud_exception",
      cloudWarnings: ["VISION_CLOUD_EXCEPTION", "VISION_CLOUD_FALLBACK_RULES"],
    });
  }
}

/** Sync entry for persist / upload sidecar (never throws; live HTTP via async only). */
export function runCloudVisionFacade(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options?: CloudVisionFacadeOptions,
): OnboardingVisionProfileV1 {
  return runCloudVisionPipelineSync(input, env, options);
}

/** Async entry for live zhipu HTTP (mocked in tests). */
export async function runCloudVisionFacadeAsync(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options?: CloudVisionFacadeOptions,
): Promise<OnboardingVisionProfileV1> {
  return runCloudVisionPipelineAsync(input, env, options);
}
