/**
 * P7.5-r1: vision module (not imported by OnboardingModule until r2 wiring).
 */

import { Module } from "@nestjs/common";
import { OnboardingVisionService } from "./onboarding-vision.service";

@Module({
  providers: [OnboardingVisionService],
  exports: [OnboardingVisionService],
})
export class OnboardingVisionModule {}
