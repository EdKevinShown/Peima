import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { OnboardingPhotoPreviewPoolActiveAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit.service";

@Module({
  imports: [PrismaModule],
  providers: [OnboardingPhotoPreviewPoolActiveAuditService],
})
export class P75R4O2PreviewPoolActiveAuditRunnerModule {}
