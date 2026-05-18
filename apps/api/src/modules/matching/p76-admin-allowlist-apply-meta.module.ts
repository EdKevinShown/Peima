import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RbacModule } from "../../common/rbac/rbac.module";
import { AuthModule } from "../auth/auth.module";
import { P76AdminAllowlistApplyMetaController } from "./p76-admin-allowlist-apply-meta.controller";
import { P76AdminAllowlistApplyMetaService } from "./p76-admin-allowlist-apply-meta.service";

@Module({
  imports: [PrismaModule, RbacModule, AuthModule],
  controllers: [P76AdminAllowlistApplyMetaController],
  providers: [P76AdminAllowlistApplyMetaService],
  exports: [P76AdminAllowlistApplyMetaService],
})
export class P76AdminAllowlistApplyMetaModule {}
