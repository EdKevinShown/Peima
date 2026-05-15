import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { OnboardingPhotoPreviewPoolFunnelAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-funnel.audit.service";

@Module({
  imports: [PrismaModule],
  providers: [OnboardingPhotoPreviewPoolFunnelAuditService],
})
export class P75R4MPreviewPoolFunnelRunnerModule {}
