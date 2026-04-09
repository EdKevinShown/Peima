/**
 * P5：建议中心 API 控制器
 * 端点：
 * - GET /suggestion-center - 列表与统计
 * - POST /suggestion-center/bulk-operate - 批量操作
 * - PATCH /suggestion-center/:id - 更新单条
 * - POST /suggestion-center/export - 导出
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { SuggestionCenterService } from "./suggestion-center.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard } from "../../common/rbac/rbac.guard";
import { RequirePermission } from "../../common/rbac/rbac.guard";
import { Permission } from "@peima/shared/constants";
import {
  P5SuggestionCenterQueryDto,
  P5SuggestionBulkOperationDto,
  P5SuggestionUpdateDto,
  P5SuggestionExportDto,
} from "./dto/p5-suggestion-center-query.dto";

type JwtReq = {
  user?: { userId: string };
};

@Controller("suggestion-center")
@UseGuards(JwtAuthGuard, RbacGuard)
export class SuggestionCenterController {
  constructor(private readonly service: SuggestionCenterService) {}

  /**
   * 获取建议列表 + 统计
   * GET /suggestion-center?status=pending&priority=high&page=1&pageSize=20
   */
  @Get()
  @RequirePermission(Permission.VIEW_OWN_SUGGESTIONS)
  async listSuggestions(
    @Query() queryDto: P5SuggestionCenterQueryDto,
    @Req() req: JwtReq,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    return this.service.listSuggestions(userId, {
      status: queryDto.status,
      priority: queryDto.priority,
      category: queryDto.category,
      assignedToOperatorId: queryDto.assignedToOperatorId,
      userId: queryDto.userId,
      createdAfter: queryDto.createdAfter ? new Date(queryDto.createdAfter) : undefined,
      createdBefore: queryDto.createdBefore ? new Date(queryDto.createdBefore) : undefined,
      page: queryDto.page ? parseInt(queryDto.page) : 1,
      pageSize: queryDto.pageSize ? parseInt(queryDto.pageSize) : 20,
      sortBy: queryDto.sortBy,
      sortOrder: queryDto.sortOrder || "desc",
    });
  }

  /**
   * 获取统计数据
   * GET /suggestion-center/stats?status=pending
   */
  @Get("stats")
  @RequirePermission(Permission.VIEW_OWN_SUGGESTIONS)
  async getStats(@Query() queryDto: P5SuggestionCenterQueryDto, @Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    return this.service.getStats(userId, {
      status: queryDto.status,
      priority: queryDto.priority,
      category: queryDto.category,
      userId: queryDto.userId,
    });
  }

  /**
   * 批量操作建议
   * POST /suggestion-center/bulk-operate
   * Body: { suggestionIds: [...], action: "accept" | "dismiss" | "assign", ... }
   */
  @Post("bulk-operate")
  @RequirePermission(Permission.MANAGE_ALL_SUGGESTIONS)
  async bulkOperate(
    @Body() dto: P5SuggestionBulkOperationDto,
    @Req() req: JwtReq,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    const count = await this.service.bulkOperateSuggestions(
      userId,
      dto.suggestionIds,
      dto.action,
      dto.assignToOperatorId,
      dto.operatorNotes,
    );

    return {
      success: true,
      message: `${count} suggestions updated`,
      count,
    };
  }

  /**
   * 更新单条建议的运营字段
   * PATCH /suggestion-center/:id
   * Body: { priority?, category?, operatorNotes?, assignedToOperatorId? }
   */
  @Patch(":suggestionId")
  @RequirePermission(Permission.MANAGE_ALL_SUGGESTIONS)
  async updateSuggestion(
    @Param("suggestionId") suggestionId: string,
    @Body() dto: P5SuggestionUpdateDto,
    @Req() req: JwtReq,
  ): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    return this.service.updateSuggestion(userId, suggestionId, {
      priority: dto.priority,
      category: dto.category,
      operatorNotes: dto.operatorNotes,
      assignedToOperatorId: dto.assignToOperatorId,
    });
  }

  /**
   * 导出建议数据为 CSV
   * POST /suggestion-center/export
   * Body: { filter条件 }
   */
  @Post("export")
  @RequirePermission(Permission.EXPORT_SUGGESTIONS)
  async exportSuggestions(
    @Body() exportDto: P5SuggestionExportDto,
    @Req() req: JwtReq,
    @Res() res: Response,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    const csv = await this.service.exportSuggestions(userId, {
      status: exportDto.status as any,
      priority: exportDto.priority,
      category: exportDto.category,
      userId: exportDto.userId,
      suggestionIds: exportDto.suggestionIds,
    }, exportDto.fields);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="suggestions-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csv);
  }

  /**
   * 获取建议的历史版本
   * GET /suggestion-center/:id/history
   */
  @Get(":suggestionId/history")
  @RequirePermission(Permission.VIEW_OWN_SUGGESTIONS)
  async getSuggestionHistory(
    @Param("suggestionId") suggestionId: string,
    @Req() req: JwtReq,
  ): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    return this.service.getSuggestionHistory(userId, suggestionId);
  }

  /**
   * 比较建议的两个版本
   * GET /suggestion-center/:id/compare?v1=1&v2=2
   */
  @Get(":suggestionId/compare")
  @RequirePermission(Permission.VIEW_OWN_SUGGESTIONS)
  async compareSuggestionVersions(
    @Param("suggestionId") suggestionId: string,
    @Query("v1") v1: string,
    @Query("v2") v2: string,
    @Req() req: JwtReq,
  ): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();

    const version1 = parseInt(v1, 10);
    const version2 = parseInt(v2, 10);

    if (isNaN(version1) || isNaN(version2)) {
      throw new Error("Invalid version numbers");
    }

    return this.service.compareVersions(userId, suggestionId, version1, version2);
  }
}

