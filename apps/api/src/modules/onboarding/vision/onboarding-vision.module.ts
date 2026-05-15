/**
 * P7.5: vision module (wired via ImagesModule for r2 score-json sidecar).
 */

import { Module } from "@nestjs/common";
import { OnboardingVisionService } from "./onboarding-vision.service";

@Module({
  providers: [OnboardingVisionService],
  exports: [OnboardingVisionService],
})
export class OnboardingVisionModule {}
