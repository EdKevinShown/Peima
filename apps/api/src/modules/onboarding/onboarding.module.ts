import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingPhotoPreviewPoolService } from "./onboarding-photo-preview-pool.service";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [PrismaModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingPhotoPreviewPoolService],
})
export class OnboardingModule {}
