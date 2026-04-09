import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import {
  NOTIFICATION_EVENTS,
  AuditAlertEvent,
} from '../events/notification.events';

// 触发告警的关键操作（与 service 层实际写入的 action 名保持一致）
const ALERT_ACTIONS = [
  'ROLE_ASSIGN',
  'ROLE_REVOKE',
  'ROLE_UPDATE',
  'SUGGESTION_BULK_OPERATE',
  'SUGGESTION_EXPORT',
  'SUGGESTION_UPDATE',
  'DELETE',
];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * 记录审计日志
   * @param userId 执行操作的用户ID
   * @param action 操作类型 (CREATE | UPDATE | DELETE | EXPORT | etc)
   * @param entityType 被操作对象类型 (SUGGESTION | USER | ROLE | etc)
   * @param dto 完整的审计数据
   */
  async recordAction(
    userId: string,
    action: string,
    entityType: string,
    dto: Partial<CreateAuditLogDto>
  ): Promise<any> {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId: dto.entityId,
          oldValues: dto.oldValues || undefined,
          newValues: dto.newValues || undefined,
          ipAddress: dto.ipAddress,
          userAgent: dto.userAgent,
          changeReason: dto.changeReason,
          status: dto.status || 'SUCCESS',
          errorMessage: dto.errorMessage,
          duration: dto.duration,
        },
      });

      this.logger.debug(
        `✓ Recorded audit: ${userId} ${action} ${entityType}${dto.entityId ? '#' + dto.entityId : ''}`
      );

      // 关键操作或失败操作触发审计告警通知
      if (ALERT_ACTIONS.includes(action) || dto.status === 'FAILED') {
        this.eventEmitter.emit(
          NOTIFICATION_EVENTS.AUDIT_ALERT,
          new AuditAlertEvent(auditLog.id, userId, action, entityType, dto.status || 'SUCCESS'),
        );
      }

      return auditLog;
    } catch (error) {
      this.logger.error(`✗ Failed to record audit: ${(error as Error).message}`, (error as Error).stack);
      // 审计日志失败不应该中断业务流程
      return null;
    }
  }

  /**
   * 按 ID 查询单条审计日志
   */
  async findById(id: string): Promise<any> {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, nickname: true, phone: true },
        },
      },
    });
  }

  /**
   * 查询审计日志
   */
  async queryLogs(query: QueryAuditLogsDto): Promise<any> {
    const {
      userId,
      action,
      entityType,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;

    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取特定对象的变更历史
   */
  async getEntityHistory(entityType: string, entityId: string, limit = 50): Promise<any> {
    return this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 获取用户的操作历史
   */
  async getUserActions(userId: string, limit = 100): Promise<any> {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 生成审计报告 - 时间段内的活动汇总
   */
  async generateReport(startDate: Date, endDate: Date) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    // 统计各种操作
    const actionStats: Record<string, number> = {};
    const entityStats: Record<string, number> = {};
    const userStats: Record<string, number> = {};
    const statusStats: Record<string, number> = { SUCCESS: 0, FAILED: 0 };

    logs.forEach((log) => {
      // 按action统计
      actionStats[log.action] = (actionStats[log.action] || 0) + 1;

      // 按entityType统计
      entityStats[log.entityType] = (entityStats[log.entityType] || 0) + 1;

      // 按用户统计
      const userKey = log.user?.nickname || log.userId;
      userStats[userKey] = (userStats[userKey] || 0) + 1;

      // 按状态统计
      statusStats[log.status]++;
    });

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      totalActions: logs.length,
      byAction: actionStats,
      byEntityType: entityStats,
      byUser: userStats,
      byStatus: statusStats,
      successRate: (
        ((statusStats.SUCCESS / logs.length) * 100) ||
        0
      ).toFixed(2) + '%',
    };
  }

  /**
   * 导出审计日志为CSV格式
   */
  async exportAsCsv(query: QueryAuditLogsDto): Promise<string> {
    const { data } = await this.queryLogs({ ...query, limit: 10000 });

    // CSV头
    const headers = [
      'ID',
      'User',
      'Action',
      'Entity Type',
      'Entity ID',
      'Status',
      'Duration (ms)',
      'IP Address',
      'Reason',
      'Created At',
    ];

    // CSV行
    const rows = data.map((log: any) => [
      log.id,
      log.user?.nickname || 'N/A',
      log.action,
      log.entityType,
      log.entityId || '-',
      log.status,
      log.duration || '-',
      log.ipAddress || '-',
      log.changeReason || '-',
      new Date(log.createdAt).toISOString(),
    ]);

    // 转换为CSV格式
    const csvContent = [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((r: any[]) => r.map((cell: any) => `"${cell || ''}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * 获取系统活动统计
   */
  async getSystemStats(hours = 24) {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    return {
      period: `Last ${hours} hours`,
      timestamp: new Date(),
      actions: Object.fromEntries(stats.map((s) => [s.action, s._count])),
      totalActions: stats.reduce((sum, s) => sum + s._count, 0),
    };
  }

  /**
   * 清理过期的审计日志 (可选，默认保留90天)
   */
  async cleanupOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    this.logger.warn(
      `Cleaned up ${result.count} audit logs older than ${daysToKeep} days`
    );
    return result;
  }
}
