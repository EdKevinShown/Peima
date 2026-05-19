import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RbacModule } from "../../common/rbac/rbac.module";
import { AuthModule } from "../auth/auth.module";
import { P76CanonicalApplyPreviewController } from "./p76-canonical-apply-preview.controller";
import { P76CanonicalApplyPreviewService } from "./p76-canonical-apply-preview.service";
import { P76CanonicalSidecarAdminController } from "./p76-canonical-sidecar-admin.controller";
import { P76CanonicalSidecarAdminService } from "./p76-canonical-sidecar-admin.service";

@Module({
  imports: [PrismaModule, RbacModule, AuthModule],
  controllers: [P76CanonicalSidecarAdminController, P76CanonicalApplyPreviewController],
  providers: [P76CanonicalSidecarAdminService, P76CanonicalApplyPreviewService],
  exports: [P76CanonicalSidecarAdminService, P76CanonicalApplyPreviewService],
})
export class P76CanonicalSidecarAdminModule {}
