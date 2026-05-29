/**
 * P7.5-r2: build vision profile for UserImage.detectionScoreJson.vision sidecar.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { isOnboardingVisionCloudRoutedProvider } from "./onboarding-vision-env";
import {
  createSkippedOnboardingVisionProfile,
  ONBOARDING_VISION_SOURCE_PERSIST_FAILED,
  ONBOARDING_VISION_SOURCE_RULES_R2,
  ONBOARDING_VISION_SOURCE_STUB_R2,
} from "./onboarding-vision-profile.builder";
import { ONBOARDING_VISION_SOURCE_CLOUD_R2 } from "./cloud-vision.facade";
import { buildVisionProfileFromCloud } from "./onboarding-vision-cloud-provider";
import { buildVisionProfileFromRules } from "./onboarding-vision-rules-provider";
import { buildVisionProfileFromStub } from "./onboarding-vision-stub-provider";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";

/**
 * When `env.enabled` is false, returns null (caller must not write `vision`).
 * When enabled, always returns a profile (ok / skipped / failed) for observability.
 */
export function buildOnboardingVisionProfileForPersist(
  detectionScoreJson: unknown,
  env: OnboardingVisionEnv,
): OnboardingVisionProfileV1 | null {
  if (!env.enabled) {
    return null;
  }

  try {
    if (env.provider === "stub") {
      return buildVisionProfileFromStub(
        { detectionScoreJson },
        env,
        { sourceVersion: ONBOARDING_VISION_SOURCE_STUB_R2 },
      );
    }

    if (isOnboardingVisionCloudRoutedProvider(env.provider)) {
      return buildVisionProfileFromCloud(
        { detectionScoreJson },
        env,
        { sourceVersion: ONBOARDING_VISION_SOURCE_CLOUD_R2 },
      );
    }

    return buildVisionProfileFromRules(
      { detectionScoreJson },
      env,
      { sourceVersion: ONBOARDING_VISION_SOURCE_RULES_R2 },
    );
  } catch {
    return createSkippedOnboardingVisionProfile(env, {
      provider: env.provider === "stub" ? "stub" : "rules",
      sourceVersion: ONBOARDING_VISION_SOURCE_PERSIST_FAILED,
      reason: "missing_detection",
      warnings: ["ONBOARDING_VISION_PERSIST_BUILD_FAILED"],
    });
  }
}
