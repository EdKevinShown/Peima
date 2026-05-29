/**
 * P7.5: vision module (wired via ImagesModule for r2 score-json sidecar).
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { OnboardingVisionService } from "./onboarding-vision.service";
import { VisualRankingShadowService } from "./visual-ranking-shadow.service";

@Module({
  imports: [PrismaModule],
  providers: [OnboardingVisionService, VisualRankingShadowService],
  exports: [OnboardingVisionService, VisualRankingShadowService],
})
export class OnboardingVisionModule {}
