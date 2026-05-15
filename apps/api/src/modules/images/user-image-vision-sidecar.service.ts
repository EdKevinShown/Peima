/**
 * P7.5-r2: Nest wrapper for vision sidecar merge (no DB).
 */

import { Injectable } from "@nestjs/common";
import { applyVisionSidecarToDetectionScoreJson } from "../onboarding/vision/onboarding-vision-sidecar";
import { OnboardingVisionService } from "../onboarding/vision/onboarding-vision.service";

@Injectable()
export class UserImageVisionSidecarService {
  constructor(private readonly onboardingVision: OnboardingVisionService) {}

  applyToDetectionScoreJson(detectionScoreJson: unknown): unknown {
    return applyVisionSidecarToDetectionScoreJson(
      detectionScoreJson,
      this.onboardingVision.readEnv(),
    );
  }
}
