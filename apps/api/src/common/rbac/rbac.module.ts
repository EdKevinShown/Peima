/**
 * P5：RBAC 模块
 * 导出 guard、decorator、service 供其他模块使用
 * 提供权限管理 API 端点
 */

import { Module } from "@nestjs/common";
import { RbacService } from "./rbac.service";
import { RbacGuard, RbacAnyGuard } from "./rbac.guard";
import { RbacController } from "./rbac.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Module({
  controllers: [RbacController],
  providers: [RbacService, RbacGuard, RbacAnyGuard, PrismaService, AuditService],
  exports: [RbacService, RbacGuard, RbacAnyGuard],
})
export class RbacModule {}
