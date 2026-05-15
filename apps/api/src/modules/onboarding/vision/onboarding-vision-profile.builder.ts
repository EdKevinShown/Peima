/**
 * P7.5-r1: assemble OnboardingVisionProfileV1 (pure functions).
 */

import { PHOTO_VISUAL_TAXONOMY_VERSION } from "./onboarding-vision-taxonomy";
import { normalizePhotoVisualTags } from "./onboarding-vision-taxonomy";
import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import type {
  OnboardingVisionProfileV1,
  OnboardingVisionProvider,
  OnboardingVisionStatus,
} from "./onboarding-vision.types";
import { ONBOARDING_VISION_SCHEMA_VERSION } from "./onboarding-vision.types";

export const ONBOARDING_VISION_SOURCE_RULES = "p7.5-r1-rules" as const;
export const ONBOARDING_VISION_SOURCE_STUB = "p7.5-r1-stub" as const;
export const ONBOARDING_VISION_SOURCE_DISABLED = "p7.5-r1-disabled" as const;

export type ProfileAssemblyParams = {
  provider: OnboardingVisionProvider;
  sourceVersion: string;
  visionStatus: OnboardingVisionStatus;
  fallbackUsed: boolean;
  photoVisualTags: string[];
  styleSignals?: string[];
  qualitySignals?: OnboardingVisionProfileV1["qualitySignals"];
  faceSignals?: OnboardingVisionProfileV1["faceSignals"];
  confidence: number;
  warnings?: string[];
  model?: string | null;
  generatedAt?: string;
};

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0.35;
  return Math.min(0.85, Math.max(0.15, n));
}

export function assembleOnboardingVisionProfile(
  params: ProfileAssemblyParams,
  env: Pick<OnboardingVisionEnv, "maxTags">,
): OnboardingVisionProfileV1 {
  const warnings = params.warnings?.length
    ? [...params.warnings]
    : undefined;

  return {
    schemaVersion: ONBOARDING_VISION_SCHEMA_VERSION,
    sourceVersion: params.sourceVersion,
    photoVisualTaxonomyVersion: PHOTO_VISUAL_TAXONOMY_VERSION,
    provider: params.provider,
    model: params.model ?? null,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    visionStatus: params.visionStatus,
    fallbackUsed: params.fallbackUsed,
    photoVisualTags: normalizePhotoVisualTags(
      params.photoVisualTags,
      env.maxTags,
    ),
    styleSignals: params.styleSignals?.length ? params.styleSignals : undefined,
    qualitySignals: params.qualitySignals,
    faceSignals: params.faceSignals,
    confidence: clampConfidence(params.confidence),
    warnings,
    rawProviderMeta: undefined,
  };
}

export function createSkippedOnboardingVisionProfile(
  env: OnboardingVisionEnv,
  options?: {
    provider?: OnboardingVisionProvider;
    sourceVersion?: string;
    warnings?: string[];
    reason?: "disabled" | "missing_detection" | "unsupported_provider";
  },
): OnboardingVisionProfileV1 {
  const reason = options?.reason ?? "missing_detection";
  const warnings = [...(options?.warnings ?? [])];
  if (reason === "disabled") {
    warnings.push("ONBOARDING_VISION_DISABLED");
  } else if (reason === "unsupported_provider") {
    warnings.push("ONBOARDING_VISION_PROVIDER_UNSUPPORTED_IN_R1");
  } else {
    warnings.push("ONBOARDING_VISION_MISSING_DETECTION_SIGNALS");
  }

  return assembleOnboardingVisionProfile(
    {
      provider: options?.provider ?? "rules",
      sourceVersion: options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_DISABLED,
      visionStatus: "skipped",
      fallbackUsed: true,
      photoVisualTags: ["生活感"],
      confidence: 0.25,
      warnings,
    },
    env,
  );
}
