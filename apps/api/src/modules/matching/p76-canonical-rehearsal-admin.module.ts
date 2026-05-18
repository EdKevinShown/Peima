import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RbacModule } from "../../common/rbac/rbac.module";
import { AuthModule } from "../auth/auth.module";
import { P76CanonicalRehearsalAdminController } from "./p76-canonical-rehearsal-admin.controller";
import { P76CanonicalRehearsalAdminService } from "./p76-canonical-rehearsal-admin.service";

@Module({
  imports: [PrismaModule, RbacModule, AuthModule],
  controllers: [P76CanonicalRehearsalAdminController],
  providers: [P76CanonicalRehearsalAdminService],
  exports: [P76CanonicalRehearsalAdminService],
})
export class P76CanonicalRehearsalAdminModule {}
