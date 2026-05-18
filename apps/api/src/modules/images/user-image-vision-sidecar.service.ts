/**
 * P7.5-r2: Nest wrapper for vision sidecar merge (no DB).
 */

import { Injectable } from "@nestjs/common";
import { applyVisionSidecarToDetectionScoreJson } from "../onboarding/vision/onboarding-vision-sidecar";
import { applyVisionSidecarForUpload } from "../onboarding/vision/onboarding-vision-upload-persist";
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

  /** P7.5-r7-c2: sync rules/stub/mock on upload; defer live cloud to async job. */
  applyToDetectionScoreJsonForUpload(
    detectionScoreJson: unknown,
    context: { userId: string },
  ): unknown {
    return applyVisionSidecarForUpload(
      detectionScoreJson,
      this.onboardingVision.readEnv(),
      { userId: context.userId },
    );
  }
}
