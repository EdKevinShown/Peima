/**
 * P7.5-r7-c2: upload-time vision persist vs deferred async cloud.
 */

import type { CloudVisionAdapterResolveContext } from "./cloud-vision.adapter-registry";
import { resolveCloudVisionAdapter } from "./cloud-vision.adapter-registry";
import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { isOnboardingVisionCloudRoutedProvider } from "./onboarding-vision-env";
import { buildOnboardingVisionProfileForPersist } from "./onboarding-vision-persist";
import {
  ONBOARDING_VISION_SOURCE_RULES_R2,
} from "./onboarding-vision-profile.builder";
import { buildVisionProfileFromRules } from "./onboarding-vision-rules-provider";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";
import { applyVisionSidecarToDetectionScoreJson } from "./onboarding-vision-sidecar";
import { mergeVisionIntoDetectionScoreJson } from "./onboarding-vision-score-json.merge";

/** Vision enabled and cloud path may use async HTTP after upload. */
export function shouldUseAsyncCloudVisionPath(env: OnboardingVisionEnv): boolean {
  return (
    env.enabled &&
    env.cloudAsync &&
    isOnboardingVisionCloudRoutedProvider(env.provider)
  );
}

/**
 * After upload row exists: run async job only when HTTP gate selects real-zhipu.
 */
export function shouldScheduleCloudVisionAsyncJob(
  env: OnboardingVisionEnv,
  context: CloudVisionAdapterResolveContext,
): boolean {
  if (!shouldUseAsyncCloudVisionPath(env)) {
    return false;
  }
  return resolveCloudVisionAdapter(env, context).adapter === "real-zhipu";
}

/**
 * On upload: rules-only initial sidecar when live zhipu will run async; mock/dry-run stay sync.
 */
export function shouldDeferLiveCloudVisionOnUpload(
  env: OnboardingVisionEnv,
  context: CloudVisionAdapterResolveContext = {},
): boolean {
  if (!shouldUseAsyncCloudVisionPath(env)) {
    return false;
  }
  return resolveCloudVisionAdapter(env, context).adapter === "real-zhipu";
}

export function buildVisionProfileForUploadPersist(
  detectionScoreJson: unknown,
  env: OnboardingVisionEnv,
  context: CloudVisionAdapterResolveContext = {},
): OnboardingVisionProfileV1 | null {
  if (!env.enabled) {
    return null;
  }
  if (shouldDeferLiveCloudVisionOnUpload(env, context)) {
    return buildVisionProfileFromRules(
      { detectionScoreJson },
      env,
      { sourceVersion: ONBOARDING_VISION_SOURCE_RULES_R2 },
    );
  }
  return buildOnboardingVisionProfileForPersist(detectionScoreJson, env);
}

export function applyVisionSidecarForUpload(
  detectionScoreJson: unknown,
  env: OnboardingVisionEnv,
  context: CloudVisionAdapterResolveContext = {},
): unknown {
  if (!env.enabled) {
    return detectionScoreJson;
  }
  const profile = buildVisionProfileForUploadPersist(
    detectionScoreJson,
    env,
    context,
  );
  if (!profile) {
    return detectionScoreJson;
  }
  return mergeVisionIntoDetectionScoreJson(detectionScoreJson, profile);
}

export function mergeCloudVisionIntoDetectionScoreJson(
  detectionScoreJson: unknown,
  profile: OnboardingVisionProfileV1,
): Record<string, unknown> {
  return mergeVisionIntoDetectionScoreJson(detectionScoreJson, profile);
}

/** @internal tests may compare non-upload sync path */
export { applyVisionSidecarToDetectionScoreJson };
