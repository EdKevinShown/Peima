import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingPhotoPreviewPoolService } from "./onboarding-photo-preview-pool.service";
import { OnboardingService } from "./onboarding.service";
import { OnboardingVisionModule } from "./vision/onboarding-vision.module";

@Module({
  imports: [PrismaModule, OnboardingVisionModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingPhotoPreviewPoolService],
})
export class OnboardingModule {}
