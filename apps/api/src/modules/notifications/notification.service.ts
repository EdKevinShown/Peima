/**
 * P5 Phase 2.3: 通知服务
 * 负责通知的持久化、查询、已读标记和定期清理
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建单条通知
   */
  async createNotification(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          actionUrl: params.actionUrl,
          metadata: params.metadata || undefined,
        },
      });
      this.logger.debug(`Created notification for user ${params.userId}: ${params.type}`);
      return notification;
    } catch (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
      return null;
    }
  }

  /**
   * 批量创建通知（给多个用户发送相同通知）
   */
  async createBulkNotifications(params: {
    userIds: string[];
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const data = params.userIds.map((userId) => ({
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        metadata: params.metadata || undefined,
      }));

      const result = await this.prisma.notification.createMany({ data });
      this.logger.debug(`Created ${result.count} notifications for ${params.userIds.length} users`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to create bulk notifications: ${error.message}`);
      return null;
    }
  }

  /**
   * 查询用户通知（分页）
   */
  async getUserNotifications(
    userId: string,
    options: { unreadOnly?: boolean; page?: number; limit?: number } = {},
  ): Promise<any> {
    const { unreadOnly = false, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (unreadOnly) where.read = false;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * 获取未读通知数量
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  /**
   * 标记单条通知为已读
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { read: true },
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`);
      return false;
    }
  }

  /**
   * 标记用户所有通知为已读
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return result.count;
  }

  /**
   * 定时清理30天前的已读通知
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldNotifications(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await this.prisma.notification.deleteMany({
        where: { read: true, createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} old read notifications`);
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup notifications: ${error.message}`);
    }
  }
}
