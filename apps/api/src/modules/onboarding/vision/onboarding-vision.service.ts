/**
 * P7.5-r1: onboarding vision service (compute-only; not wired to upload/pool in r1).
 */

import { Injectable } from "@nestjs/common";
import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import {
  isOnboardingVisionExternalProviderSupported,
  readOnboardingVisionEnv,
} from "./onboarding-vision-env";
import { buildVisionProfileFromRules } from "./onboarding-vision-rules-provider";
import { buildVisionProfileFromStub } from "./onboarding-vision-stub-provider";
import { createSkippedOnboardingVisionProfile } from "./onboarding-vision-profile.builder";
import type {
  OnboardingVisionBuildInput,
  OnboardingVisionProfileV1,
  OnboardingVisionRulesInput,
} from "./onboarding-vision.types";

@Injectable()
export class OnboardingVisionService {
  readEnv(): OnboardingVisionEnv {
    return readOnboardingVisionEnv();
  }

  buildVisionProfileFromRules(
    input: OnboardingVisionRulesInput,
    env?: OnboardingVisionEnv,
  ): OnboardingVisionProfileV1 {
    return buildVisionProfileFromRules(input, env ?? this.readEnv());
  }

  buildVisionProfileFromStub(
    input: OnboardingVisionRulesInput = {},
    env?: OnboardingVisionEnv,
  ): OnboardingVisionProfileV1 {
    return buildVisionProfileFromStub(input, env ?? this.readEnv());
  }

  /**
   * Explicit invoke only (r1: not called from upload / preview pool).
   * When disabled → skipped profile with fallbackUsed.
   * When provider=zhipu → skipped (no external call in r1).
   */
  buildVisionProfile(
    input: OnboardingVisionBuildInput,
    env?: OnboardingVisionEnv,
  ): OnboardingVisionProfileV1 {
    const cfg = env ?? this.readEnv();

    if (!cfg.enabled) {
      return createSkippedOnboardingVisionProfile(cfg, {
        reason: "disabled",
        provider: cfg.provider,
      });
    }

    if (!isOnboardingVisionExternalProviderSupported(cfg)) {
      return createSkippedOnboardingVisionProfile(cfg, {
        reason: "unsupported_provider",
        provider: "zhipu",
        warnings: ["ONBOARDING_VISION_PROVIDER_UNSUPPORTED_IN_R1"],
      });
    }

    if (cfg.provider === "stub") {
      return buildVisionProfileFromStub(input, cfg);
    }

    return buildVisionProfileFromRules(input, cfg);
  }
}
