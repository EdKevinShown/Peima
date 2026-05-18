import { Module } from "@nestjs/common";
import { OnboardingModule } from "../modules/onboarding/onboarding.module";
import { OnboardingPhotoPreviewPoolActiveAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit.service";

@Module({
  imports: [OnboardingModule],
  providers: [OnboardingPhotoPreviewPoolActiveAuditService],
})
export class P75R5C2ApplyWriterSignoffRunnerModule {}
