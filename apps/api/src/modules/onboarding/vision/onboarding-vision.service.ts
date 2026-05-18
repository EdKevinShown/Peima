/**
 * P7.5-r1: onboarding vision service (compute-only; not wired to upload/pool in r1).
 */

import { Injectable } from "@nestjs/common";
import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import {
  isOnboardingVisionCloudRoutedProvider,
  readOnboardingVisionEnv,
} from "./onboarding-vision-env";
import { buildVisionProfileFromCloud } from "./onboarding-vision-cloud-provider";
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

  buildVisionProfileFromCloud(
    input: OnboardingVisionBuildInput,
    env?: OnboardingVisionEnv,
  ): OnboardingVisionProfileV1 {
    return buildVisionProfileFromCloud(
      {
        detectionScoreJson: input.detectionScoreJson,
        viewerStyleTags: input.viewerStyleTags,
      },
      env ?? this.readEnv(),
    );
  }

  /**
   * Explicit invoke only (r1: not called from upload / preview pool).
   * When disabled → skipped profile with fallbackUsed.
   * provider=cloud|zhipu → mock/dry-run facade (r7-b, no HTTP).
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

    if (cfg.provider === "stub") {
      return buildVisionProfileFromStub(input, cfg);
    }

    if (isOnboardingVisionCloudRoutedProvider(cfg.provider)) {
      return buildVisionProfileFromCloud(
        {
          detectionScoreJson: input.detectionScoreJson,
          viewerStyleTags: input.viewerStyleTags,
        },
        cfg,
      );
    }

    return buildVisionProfileFromRules(input, cfg);
  }
}
