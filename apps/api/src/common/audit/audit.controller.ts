import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Res,
  UseGuards,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { RequirePermission, RbacGuard } from '../rbac/rbac.guard';
import { Permission } from '@peima/shared/constants';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private auditService: AuditService) {}

  /**
   * 列表查询审计日志
   */
  @Get()
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getAuditLogs(@Query() query: QueryAuditLogsDto): Promise<any> {
    this.logger.debug(`Querying audit logs with filters: ${JSON.stringify(query)}`);
    return this.auditService.queryLogs(query);
  }

  /**
   * 获取审计日志详情
   */
  @Get(':id')
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getAuditLogDetail(@Param('id') id: string) {
    const log = await this.auditService.findById(id);
    if (!log) {
      throw new NotFoundException(`Audit log ${id} not found`);
    }
    return log;
  }

  /**
   * 获取特定对象的变更历史
   */
  @Get('entity/:entityType/:entityId')
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('limit') limit = 50
  ): Promise<any> {
    this.logger.debug(
      `Fetching history for ${entityType}#${entityId} (limit: ${limit})`
    );
    return this.auditService.getEntityHistory(entityType, entityId, limit);
  }

  /**
   * 导出审计日志
   */
  @Post('export')
  @RequirePermission(Permission.EXPORT_DATA)
  async exportAuditLogs(
    @Query() query: QueryAuditLogsDto,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Res() res: Response,
  ) {
    try {
      this.logger.debug(`Exporting audit logs in ${format} format`);

      if (format === 'csv') {
        const csv = await this.auditService.exportAsCsv(query);

        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="audit-logs-' +
            new Date().toISOString().split('T')[0] +
            '.csv"',
        });
        return res.send(csv);
      } else {
        // JSON format
        const { data } = await this.auditService.queryLogs({
          ...query,
          limit: 5000,
        });

        res.set({
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition':
            'attachment; filename="audit-logs-' +
            new Date().toISOString().split('T')[0] +
            '.json"',
        });
        return res.json({
          exported: new Date().toISOString(),
          count: data.length,
          data,
        });
      }
    } catch (error) {
      this.logger.error(`Export failed: ${(error as Error).message}`, (error as Error).stack);
      return res.status(500).json({
        error: 'Export failed',
        message: (error as Error).message,
      });
    }
  }

  /**
   * 获取审计报告 - 统计汇总
   */
  @Get('report/summary')
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getAuditReport(
    @Query('hours') hours = 24,
    @Query('days') days?: number
  ) {
    // 支持hours或days参数
    const timeRange = days ? days * 24 : hours;

    this.logger.debug(`Generating audit report for last ${timeRange} hours`);
    return this.auditService.getSystemStats(timeRange);
  }

  /**
   * 获取详细审计报告 - 按日期范围
   */
  @Post('report/detailed')
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getDetailedReport(
    @Body() body: { startDate: string; endDate: string }
  ) {
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return { error: 'startDate and endDate are required' };
    }

    try {
      const report = await this.auditService.generateReport(
        new Date(startDate),
        new Date(endDate)
      );
      return report;
    } catch (error) {
      this.logger.error(`Report generation failed: ${(error as Error).message}`);
      return { error: 'Failed to generate report', message: (error as Error).message };
    }
  }

  /**
   * 获取用户的操作历史
   */
  @Get('user/:userId')
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getUserActions(
    @Param('userId') userId: string,
    @Query('limit') limit = 50
  ): Promise<any> {
    this.logger.debug(`Fetching actions for user ${userId} (limit: ${limit})`);
    return this.auditService.getUserActions(userId, limit);
  }

  /**
   * 获取系统统计信息
   */
  @Get('stats/system')
  @RequirePermission(Permission.VIEW_AUDIT_LOG)
  async getSystemStats(@Query('hours') hours = 24) {
    this.logger.debug(`Fetching system stats for last ${hours} hours`);
    return this.auditService.getSystemStats(hours);
  }
}
