/**
 * P7.5-r7-b: cloud provider entry (mock/dry-run only).
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { isOnboardingVisionCloudRoutedProvider } from "./onboarding-vision-env";
import {
  ONBOARDING_VISION_SOURCE_CLOUD_R2,
  runCloudVisionFacade,
  type CloudVisionFacadeInput,
} from "./cloud-vision.facade";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";

export function buildVisionProfileFromCloud(
  input: CloudVisionFacadeInput,
  env: OnboardingVisionEnv,
  options?: { sourceVersion?: string },
): OnboardingVisionProfileV1 {
  const routedFrom =
    env.provider === "zhipu" ? ("zhipu" as const) : ("cloud" as const);
  return runCloudVisionFacade(input, env, {
    sourceVersion: options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_CLOUD_R2,
    routedFrom,
  });
}

export function shouldRouteOnboardingVisionToCloud(
  env: OnboardingVisionEnv,
): boolean {
  return isOnboardingVisionCloudRoutedProvider(env.provider);
}
