/**
 * P5 Phase 2.3: 通知事件定义
 * 服务层 emit 这些事件，NotificationGateway 监听并处理
 */

// 事件名称常量
export const NOTIFICATION_EVENTS = {
  ROLE_CHANGED: 'notification.role_changed',
  SUGGESTION_UPDATED: 'notification.suggestion_updated',
  AUDIT_ALERT: 'notification.audit_alert',
  SYSTEM_MESSAGE: 'notification.system_message',
} as const;

// 角色变更事件
export class RoleChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly roleCode: string,
    public readonly action: 'assigned' | 'removed',
    public readonly grantedBy?: string,
    public readonly expiresAt?: Date,
  ) {}
}

// 建议状态更新事件
export class SuggestionUpdatedEvent {
  constructor(
    public readonly suggestionIds: string[],
    public readonly action: 'accept' | 'dismiss' | 'assign' | 'update',
    public readonly operatorId: string,
    public readonly affectedUserIds?: string[],
  ) {}
}

// 审计告警事件（关键操作/失败操作）
export class AuditAlertEvent {
  constructor(
    public readonly auditLogId: string,
    public readonly userId: string,
    public readonly action: string,
    public readonly entityType: string,
    public readonly status: string,
  ) {}
}

// 系统消息事件
export class SystemMessageEvent {
  constructor(
    public readonly title: string,
    public readonly message: string,
    public readonly targetUserIds?: string[],
    public readonly targetRoles?: string[],
  ) {}
}
