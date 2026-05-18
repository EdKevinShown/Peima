import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RbacModule } from "../../common/rbac/rbac.module";
import { AuthModule } from "../auth/auth.module";
import { P76CanonicalSidecarAdminController } from "./p76-canonical-sidecar-admin.controller";
import { P76CanonicalSidecarAdminService } from "./p76-canonical-sidecar-admin.service";

@Module({
  imports: [PrismaModule, RbacModule, AuthModule],
  controllers: [P76CanonicalSidecarAdminController],
  providers: [P76CanonicalSidecarAdminService],
  exports: [P76CanonicalSidecarAdminService],
})
export class P76CanonicalSidecarAdminModule {}
