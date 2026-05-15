/**
 * P7.5-r1: deterministic stub profile for tests / dev.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { readOnboardingVisionEnv } from "./onboarding-vision-env";
import {
  assembleOnboardingVisionProfile,
  ONBOARDING_VISION_SOURCE_STUB,
} from "./onboarding-vision-profile.builder";
import type {
  OnboardingVisionProfileV1,
  OnboardingVisionRulesInput,
} from "./onboarding-vision.types";

export function buildVisionProfileFromStub(
  _input: OnboardingVisionRulesInput = {},
  env: OnboardingVisionEnv = readOnboardingVisionEnv(),
  options?: { sourceVersion?: string },
): OnboardingVisionProfileV1 {
  return assembleOnboardingVisionProfile(
    {
      provider: "stub",
      sourceVersion:
        options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_STUB,
      visionStatus: "ok",
      fallbackUsed: false,
      photoVisualTags: ["生活感", "简约干净", "清爽自然"],
      qualitySignals: {
        clarity: "medium",
        lighting: "normal",
        composition: "centered_face",
      },
      faceSignals: {
        faceCount: 1,
        multipleFacesWarning: false,
      },
      confidence: 0.5,
    },
    env,
  );
}
