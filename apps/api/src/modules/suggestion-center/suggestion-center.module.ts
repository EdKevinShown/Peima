/**
 * P5：建议中心模块
 * 提供建议查询、管理、导出能力
 */

import { Module } from "@nestjs/common";
import { SuggestionCenterController } from "./suggestion-center.controller";
import { SuggestionCenterService } from "./suggestion-center.service";
import { SuggestionCenterRepository } from "./suggestion-center.repository";
import { SuggestionHistoryService } from "./suggestion-history.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RbacModule } from "../../common/rbac/rbac.module";
import { AuditModule } from "../../common/audit/audit.module";

@Module({
  imports: [PrismaModule, RbacModule, AuditModule],
  controllers: [SuggestionCenterController],
  providers: [SuggestionCenterService, SuggestionCenterRepository, SuggestionHistoryService],
  exports: [SuggestionCenterService, SuggestionCenterRepository, SuggestionHistoryService],
})
export class SuggestionCenterModule {}
