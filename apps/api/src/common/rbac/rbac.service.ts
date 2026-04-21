/**
 * P5 Phase 2.2：RBAC 服务（数据库持久化版本）
 * 提供权限检查、角色管理、权限查询的完整业务逻辑
 * 支持角色过期、权限映射、审计日志集成
 */

import { Injectable, ForbiddenException, Logger } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  UserRole,
  Permission,
  hasPermission,
  getRolesFromEnv,
  ROLE_PERMISSIONS_MAP,
} from "@peima/shared/constants";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  NOTIFICATION_EVENTS,
  RoleChangedEvent,
} from "../events/notification.events";

function isTruthyEnvSkipRbacInit(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private readonly ROLE_CACHE_TTL_MS = 3600 * 1000; // 1 小时缓存
  private roleCache: Map<string, { roles: UserRole[]; timestamp: number }> =
    new Map();

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
  ) {
    void this.initializeDefaultRoles();
  }

  /**
   * 本地缺表 / reset 后无 `role_permissions`：跳过 DB seed，避免启动阶段 error 刷屏；权限仍走 ROLE_PERMISSIONS_MAP + env。
   */
  private isMissingRbacRolePermissionSchema(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021"
    ) {
      return true;
    }
    const msg =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();
    const namesRoleTable =
      msg.includes("role_permissions") || msg.includes("role_permission");
    const looksMissing =
      msg.includes("does not exist") ||
      msg.includes("could not find") ||
      msg.includes("unknown table");
    return namesRoleTable && looksMissing;
  }

  /**
   * 初始化默认角色权限映射（从环境变量中的用户）
   * 目标：逐步将环境变量中的配置迁移到数据库
   */
  private async initializeDefaultRoles(): Promise<void> {
    if (isTruthyEnvSkipRbacInit(process.env.PEIMA_RBAC_SKIP_DB_INIT)) {
      this.logger.warn(
        "PEIMA_RBAC_SKIP_DB_INIT is set: skipping default role_permission DB seed (local dev).",
      );
      return;
    }

    try {
      // 检查数据库中是否已有角色权限定义
      const existingCount = await this.prisma.rolePermission.count();
      if (existingCount > 0) {
        this.logger.debug("Role permissions already initialized in database");
        return;
      }

      // 从 ROLE_PERMISSIONS_MAP 初始化角色权限
      const rolePermissions = [];
      for (const [roleCode, permissions] of Object.entries(
        ROLE_PERMISSIONS_MAP,
      )) {
        for (const permissionCode of permissions) {
          rolePermissions.push({
            roleCode,
            permissionCode,
            resource: null,
            conditions: null,
          });
        }
      }

      await this.prisma.rolePermission.createMany({
        data: rolePermissions.map((perm) => ({
          roleCode: perm.roleCode,
          permissionCode: perm.permissionCode,
          resource: perm.resource || undefined,
          conditions: perm.conditions || undefined,
        })),
        skipDuplicates: true,
      });

      this.logger.log(
        `✓ Initialized ${rolePermissions.length} role-permission mappings`
      );
    } catch (error) {
      if (this.isMissingRbacRolePermissionSchema(error)) {
        this.logger.warn(
          `Skipping default role_permission seed: RBAC table missing or unreachable (${error instanceof Error ? error.message : String(error)}). Using in-memory ROLE_PERMISSIONS_MAP / env fallback.`,
        );
        return;
      }
      this.logger.error(
        `Failed to initialize role permissions: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * 获取用户的所有角色（数据库 + 缓存 + env 回退）
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    // 1. 检查缓存
    const cached = this.roleCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.ROLE_CACHE_TTL_MS) {
      return cached.roles;
    }

    try {
      // 2. 从数据库查询（优先）
      const userRoles = await this.prisma.userRole.findMany({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], // 不过期或未来才有效
        },
        select: { roleCode: true },
      });

      let roles = userRoles
        .map((ur) => ur.roleCode as UserRole)
        .filter((role) => Object.values(UserRole).includes(role));

      // 合并环境变量中配置的角色（确保 env 配置的管理员始终有效）
      const envRoles = getRolesFromEnv(userId);
      for (const envRole of envRoles) {
        if (!roles.includes(envRole)) {
          roles.push(envRole);
        }
      }

      // 包含所有人都有的REGULAR_USER角色
      if (!roles.includes(UserRole.REGULAR_USER)) {
        roles.push(UserRole.REGULAR_USER);
      }

      // 缓存结果
      this.roleCache.set(userId, { roles, timestamp: Date.now() });
      return roles;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch user roles from DB, falling back to env: ${(error as Error).message}`
      );
      // 3. 回退到环境变量
      return getRolesFromEnv(userId);
    }
  }

  /**
   * 获取所有配置了角色的用户列表
   */
  async getAllConfiguredUserIds(): Promise<string[]> {
    try {
      const users = await this.prisma.userRole.findMany({
        distinct: ["userId"],
        select: { userId: true },
      });

      const userIds = new Set(users.map((u) => u.userId));

      // 也包括env中配置的用户
      const envUserIds = [
        ...(process.env.PEIMA_ADMIN_USER_IDS?.split(",") ?? []),
        ...(process.env.PEIMA_OPERATOR_USER_IDS?.split(",") ?? []),
        ...(process.env.PEIMA_DATA_ANALYST_USER_IDS?.split(",") ?? []),
      ].filter(Boolean);

      envUserIds.forEach((id) => userIds.add(id.trim()));
      return Array.from(userIds);
    } catch (error) {
      this.logger.error(`Failed to get configured user IDs: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取某个角色的所有权限
   */
  async getPermissionsForRole(roleCode: UserRole): Promise<Permission[]> {
    try {
      const permissions = await this.prisma.rolePermission.findMany({
        where: { roleCode },
        select: { permissionCode: true },
      });

      return permissions
        .map(
          (p) =>
            p.permissionCode as Permission,
        )
        .filter((perm) =>
          Object.values(Permission).includes(perm)
        );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch permissions for role ${roleCode}: ${(error as Error).message}`
      );
      // 回退到内存的ROLE_PERMISSIONS_MAP
      return ROLE_PERMISSIONS_MAP[roleCode] || [];
    }
  }

  /**
   * 分配角色给用户（数据库持久化）
   */
  async assignRoleToUser(
    userId: string,
    roleCode: UserRole,
    grantedBy?: string,
    expiresAt?: Date,
  ): Promise<void> {
    try {
      // 如果已存在，更新；否则创建
      await this.prisma.userRole.upsert({
        where: { userId_roleCode: { userId, roleCode } },
        create: {
          userId,
          roleCode,
          grantedBy,
          expiresAt,
        },
        update: {
          grantedBy,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      // 清除缓存
      this.roleCache.delete(userId);

      // 记录审计日志
      await this.auditService.recordAction(
        grantedBy || "SYSTEM",
        "ROLE_ASSIGN",
        "ROLE",
        {
          entityId: userId,
          newValues: { roleCode, expiresAt },
          changeReason: `Assigned role ${roleCode} to user ${userId}`,
        }
      );

      // 发送角色变更通知事件
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.ROLE_CHANGED,
        new RoleChangedEvent(userId, roleCode, 'assigned', grantedBy, expiresAt),
      );

      this.logger.log(`✓ Assigned role ${roleCode} to user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to assign role: ${(error as Error).message}`,
        (error as Error).stack
      );
      if (grantedBy) {
        await this.auditService.recordAction(grantedBy, "ROLE_ASSIGN", "ROLE", {
          entityId: userId,
          newValues: { roleCode },
          changeReason: `Assigned role ${roleCode} to user ${userId}`,
          status: "FAILED",
          errorMessage: (error as Error).message,
        });
      }
      throw error;
    }
  }

  /**
   * 移除用户的角色
   */
  async removeRoleFromUser(userId: string, roleCode: UserRole, revokedBy?: string): Promise<void> {
    try {
      // deleteMany 不会在记录不存在时抛错（env-only 角色无 DB 记录）
      const result = await this.prisma.userRole.deleteMany({
        where: { userId, roleCode },
      });

      if (result.count === 0) {
        this.logger.warn(`Role ${roleCode} not found in DB for user ${userId} — may be env-configured only`);
      }

      // 清除缓存
      this.roleCache.delete(userId);

      // 记录审计日志（仅当有真实操作者时才记录，避免 FK 违反）
      if (revokedBy) {
        await this.auditService.recordAction(
          revokedBy,
          "ROLE_REVOKE",
          "ROLE",
          {
            entityId: userId,
            oldValues: { roleCode },
            changeReason: `Removed role ${roleCode} from user ${userId}`,
          }
        );
      }

      // 发送角色撤销通知事件
      this.eventEmitter.emit(
        NOTIFICATION_EVENTS.ROLE_CHANGED,
        new RoleChangedEvent(userId, roleCode, 'removed'),
      );

      this.logger.log(`✓ Removed role ${roleCode} from user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove role: ${(error as Error).message}`,
        (error as Error).stack
      );
      if (revokedBy) {
        await this.auditService.recordAction(revokedBy, "ROLE_REVOKE", "ROLE", {
          entityId: userId,
          oldValues: { roleCode },
          changeReason: `Removed role ${roleCode} from user ${userId}`,
          status: "FAILED",
          errorMessage: (error as Error).message,
        });
      }
      throw error;
    }
  }

  /**
   * 更新用户的所有角色
   */
  async updateUserRoles(
    userId: string,
    newRoles: UserRole[],
    grantedBy?: string,
  ): Promise<void> {
    try {
      // 获取现有角色
      const existingRoles = await this.prisma.userRole.findMany({
        where: { userId },
        select: { roleCode: true },
      });

      const existingCodes = existingRoles.map((r) => r.roleCode as UserRole);

      // 删除需要移除的角色
      const rolesToRemove = existingCodes.filter((r) => !newRoles.includes(r));
      for (const role of rolesToRemove) {
        await this.prisma.userRole.delete({
          where: { userId_roleCode: { userId, roleCode: role } },
        });
      }

      // 添加新角色
      const rolesToAdd = newRoles.filter((r) => !existingCodes.includes(r));
      for (const role of rolesToAdd) {
        await this.prisma.userRole.create({
          data: { userId, roleCode: role, grantedBy },
        });
      }

      // 清除缓存
      this.roleCache.delete(userId);

      // 发送角色变更通知事件
      for (const role of rolesToAdd) {
        this.eventEmitter.emit(
          NOTIFICATION_EVENTS.ROLE_CHANGED,
          new RoleChangedEvent(userId, role, 'assigned', grantedBy),
        );
      }
      for (const role of rolesToRemove) {
        this.eventEmitter.emit(
          NOTIFICATION_EVENTS.ROLE_CHANGED,
          new RoleChangedEvent(userId, role, 'removed', grantedBy),
        );
      }

      this.logger.log(
        `✓ Updated roles for ${userId}: ${newRoles.join(", ")}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to update user roles: ${(error as Error).message}`,
        (error as Error).stack
      );
      throw error;
    }
  }

  /**
   * 检查用户是否拥有某权限
   */
  async checkPermission(
    userId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      const roles = await this.getUserRoles(userId);
      return hasPermission(roles, permission);
    } catch (error) {
      this.logger.error(
        `Error checking permission: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * 检查用户权限，不通过时抛异常
   */
  async requirePermission(
    userId: string,
    permission: Permission
  ): Promise<void> {
    const hasPerms = await this.checkPermission(userId, permission);
    if (!hasPerms) {
      throw new ForbiddenException(
        `Permission denied: '${permission}' required`
      );
    }
  }

  /**
   * 定期清理过期的角色（每天凌晨2点运行）
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredRoles(): Promise<void> {
    try {
      const result = await this.prisma.userRole.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      if (result.count > 0) {
        this.logger.log(`✓ Cleaned up ${result.count} expired role assignments`);
        this.roleCache.clear(); // 清除所有缓存
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired roles: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }

  /**
   * 清空角色缓存（当权限变更时调用）
   */
  clearRoleCache(userId?: string): void {
    if (userId) {
      this.roleCache.delete(userId);
    } else {
      this.roleCache.clear();
    }
  }

  /**
   * 获取用户的完整角色和权限信息（管理员视图）
   */
  async getUserRoleDetails(userId: string) {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: {
          grantedByUser: {
            select: { id: true, nickname: true },
          },
        },
      });

      const permissions = new Set<Permission>();
      for (const ur of userRoles) {
        const rolePerms = await this.getPermissionsForRole(
          ur.roleCode as UserRole
        );
        rolePerms.forEach((p) => permissions.add(p));
      }

      return {
        userId,
        roles: userRoles,
        permissions: Array.from(permissions),
        rolesCount: userRoles.length,
        permissionsCount: permissions.size,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get role details: ${(error as Error).message}`
      );
      return null;
    }
  }
}
