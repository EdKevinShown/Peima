/**
 * P5 Phase 2.3: WebSocket 通知网关
 * 处理实时连接、JWT认证、事件广播
 */

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../common/config/jwt-secret.config';
import { NotificationService } from './notification.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { UserRole } from '@peima/shared/constants';
import {
  NOTIFICATION_EVENTS,
  RoleChangedEvent,
  SuggestionUpdatedEvent,
  AuditAlertEvent,
  SystemMessageEvent,
} from '../../common/events/notification.events';

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  // 记录 socketId -> userId 的映射，用于 disconnect 清理
  private socketUserMap = new Map<string, string>();

  constructor(
    private notificationService: NotificationService,
    private rbacService: RbacService,
  ) {}

  /**
   * 客户端连接时：验证JWT，加入用户房间和角色房间
   */
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection rejected: no token (socket ${client.id})`);
        client.disconnect();
        return;
      }

      const secret = getJwtSecret();
      const payload = jwt.verify(token, secret) as { sub: string };
      const userId = payload.sub;

      if (!userId) {
        client.disconnect();
        return;
      }

      // 存储映射
      this.socketUserMap.set(client.id, userId);

      // 加入用户专属房间
      client.join(`user:${userId}`);

      // 加入角色房间
      const roles = await this.rbacService.getUserRoles(userId);
      for (const role of roles) {
        client.join(`role:${role}`);
      }

      // 发送未读数
      const unreadCount = await this.notificationService.getUnreadCount(userId);
      client.emit('notification:count', { unreadCount });

      this.logger.log(
        `Client connected: ${userId} (socket ${client.id}, roles: ${roles.join(',')})`,
      );
    } catch (error) {
      this.logger.warn(`Connection rejected: invalid token (${(error as Error).message})`);
      client.disconnect();
    }
  }

  /**
   * 客户端断开
   */
  handleDisconnect(client: Socket) {
    const userId = this.socketUserMap.get(client.id);
    this.socketUserMap.delete(client.id);
    if (userId) {
      this.logger.debug(`Client disconnected: ${userId} (socket ${client.id})`);
    }
  }

  // ===== 客户端主动发送的消息 =====

  @SubscribeMessage('notifications:mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    const userId = this.socketUserMap.get(client.id);
    if (!userId) return;

    await this.notificationService.markAsRead(data.notificationId, userId);
    const unreadCount = await this.notificationService.getUnreadCount(userId);
    client.emit('notification:count', { unreadCount });
  }

  @SubscribeMessage('notifications:mark_all_read')
  async handleMarkAllRead(@ConnectedSocket() client: Socket) {
    const userId = this.socketUserMap.get(client.id);
    if (!userId) return;

    await this.notificationService.markAllAsRead(userId);
    client.emit('notification:count', { unreadCount: 0 });
  }

  // ===== 内部事件监听（EventEmitter2）→ 持久化 + 推送 =====

  @OnEvent(NOTIFICATION_EVENTS.ROLE_CHANGED)
  async handleRoleChanged(event: RoleChangedEvent) {
    const actionLabel = event.action === 'assigned' ? '分配' : '撤销';
    const notification = await this.notificationService.createNotification({
      userId: event.userId,
      type: 'role_change',
      title: `角色${actionLabel}`,
      message: `您的角色 ${event.roleCode} 已被${actionLabel}${event.expiresAt ? `（有效期至 ${event.expiresAt.toISOString().split('T')[0]}）` : ''}`,
      actionUrl: '/permissions',
      metadata: {
        roleCode: event.roleCode,
        action: event.action,
        grantedBy: event.grantedBy,
      },
    });

    if (notification) {
      this.emitToUser(event.userId, 'notification:new', notification);
      // 也通知所有管理员
      this.broadcastToRole(UserRole.ADMIN, 'notification:role_activity', {
        userId: event.userId,
        roleCode: event.roleCode,
        action: event.action,
      });
    }
  }

  @OnEvent(NOTIFICATION_EVENTS.SUGGESTION_UPDATED)
  async handleSuggestionUpdated(event: SuggestionUpdatedEvent) {
    if (!event.affectedUserIds?.length) return;

    const actionLabels: Record<string, string> = {
      accept: '通过', dismiss: '驳回', assign: '分配', update: '更新',
    };
    const label = actionLabels[event.action] || event.action;

    for (const userId of event.affectedUserIds) {
      const notification = await this.notificationService.createNotification({
        userId,
        type: 'suggestion_update',
        title: `建议${label}`,
        message: `您有 ${event.suggestionIds.length} 条建议已被${label}`,
        actionUrl: '/suggestions',
        metadata: {
          suggestionIds: event.suggestionIds,
          action: event.action,
          operatorId: event.operatorId,
        },
      });

      if (notification) {
        this.emitToUser(userId, 'notification:new', notification);
      }
    }
  }

  @OnEvent(NOTIFICATION_EVENTS.AUDIT_ALERT)
  async handleAuditAlert(event: AuditAlertEvent) {
    // 发送给所有管理员
    const adminUsers = await this.getAdminUserIds();
    if (adminUsers.length === 0) return;

    await this.notificationService.createBulkNotifications({
      userIds: adminUsers,
      type: 'audit_alert',
      title: '审计告警',
      message: `操作 ${event.action} 在 ${event.entityType} 上${event.status === 'FAILED' ? '失败' : '触发告警'}`,
      actionUrl: '/audit-logs',
      metadata: {
        auditLogId: event.auditLogId,
        action: event.action,
        entityType: event.entityType,
        status: event.status,
      },
    });

    this.broadcastToRole(UserRole.ADMIN, 'notification:audit_alert', {
      auditLogId: event.auditLogId,
      action: event.action,
      entityType: event.entityType,
      status: event.status,
    });
  }

  @OnEvent(NOTIFICATION_EVENTS.SYSTEM_MESSAGE)
  async handleSystemMessage(event: SystemMessageEvent) {
    const targetUserIds: string[] = [];

    if (event.targetUserIds?.length) {
      targetUserIds.push(...event.targetUserIds);
    }

    if (event.targetRoles?.length) {
      for (const role of event.targetRoles) {
        this.broadcastToRole(role, 'notification:system', {
          title: event.title,
          message: event.message,
        });
      }
    }

    if (targetUserIds.length > 0) {
      await this.notificationService.createBulkNotifications({
        userIds: targetUserIds,
        type: 'system_message',
        title: event.title,
        message: event.message,
      });

      for (const userId of targetUserIds) {
        this.emitToUser(userId, 'notification:new', {
          type: 'system_message',
          title: event.title,
          message: event.message,
        });
      }
    }
  }

  // ===== 辅助方法 =====

  private emitToUser(userId: string, event: string, data: any) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  private broadcastToRole(roleCode: string, event: string, data: any) {
    this.server?.to(`role:${roleCode}`).emit(event, data);
  }

  private async getAdminUserIds(): Promise<string[]> {
    try {
      // DB 中有 admin 角色的用户
      const dbAdmins = await (this.notificationService as any).prisma.userRole.findMany({
        where: { roleCode: UserRole.ADMIN },
        select: { userId: true },
      });
      const adminSet = new Set<string>(dbAdmins.map((a: any) => a.userId as string));

      // env 白名单中配置的 admin（getRolesFromEnv 的来源）
      const envAdminIds = (process.env.PEIMA_ADMIN_USER_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      envAdminIds.forEach((id) => adminSet.add(id));

      return Array.from(adminSet);
    } catch {
      return [];
    }
  }
}
