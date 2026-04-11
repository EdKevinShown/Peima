/**
 * P5 Phase 2.2：权限管理 API 控制器（数据库持久化版本）
 * 端点：
 * - GET /rbac/users - 获取所有用户及其角色
 * - PATCH /rbac/users/:userId/roles - 更新用户角色
 * - POST /rbac/users/:userId/role - 分配单个角色
 * - DELETE /rbac/users/:userId/role/:roleCode - 移除单个角色
 * - GET /rbac/users/:userId - 获取用户的角色和权限详情
 * - GET /rbac/permissions - 获取权限清单
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UnauthorizedException,
  UseGuards,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard";
import { RbacGuard } from "./rbac.guard";
import { RequirePermission } from "./rbac.guard";
import { RbacService } from "./rbac.service";
import { PrismaService } from "../prisma/prisma.service";
import { Permission, UserRole } from "@peima/shared/constants";
import { UpdateUserRoleDto } from "./dto/assign-role.dto";

type JwtReq = {
  user?: { userId: string };
};

@Controller("rbac")
@UseGuards(JwtAuthGuard, RbacGuard)
export class RbacController {
  private readonly logger = new Logger(RbacController.name);

  constructor(
    private readonly rbacService: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取权限清单（角色和权限枚举）
   * GET /rbac/permissions
   */
  @Get("permissions")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async getPermissions() {
    return {
      roles: Object.values(UserRole),
      permissions: Object.values(Permission),
      roleDescriptions: {
        [UserRole.REGULAR_USER]: "普通用户 - 查看自己的建议",
        [UserRole.OPERATOR]: "运营人员 - 管理和处理建议",
        [UserRole.DATA_ANALYST]: "数据分析 - 查看全局数据",
        [UserRole.ADMIN]: "管理员 - 完全权限",
      },
    };
  }

  /**
   * 获取所有用户及其角色
   * GET /rbac/users
   */
  @Get("users")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async getUsers(@Req() req: JwtReq) {
    const requesterId = req.user?.userId;
    if (!requesterId) throw new UnauthorizedException();

    try {
      // 获取所有已配置的用户
      const configuredUserIds =
        await this.rbacService.getAllConfiguredUserIds();

      // 从数据库获取用户信息
      const users = await this.prisma.user.findMany({
        where: {
          id: {
            in: configuredUserIds,
          },
        },
        select: {
          id: true,
          phone: true,
          nickname: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // 补充每个用户的角色
      const usersWithRoles = await Promise.all(
        users.map(async (user) => ({
          ...user,
          roles: await this.rbacService.getUserRoles(user.id),
        }))
      );

      return {
        items: usersWithRoles,
        total: usersWithRoles.length,
      };
    } catch (error) {
      this.logger.error(`Error fetching users: ${(error as Error).message}`);
      return { items: [], total: 0, error: (error as Error).message };
    }
  }

  /**
   * 获取用户的角色和权限详情
   * GET /rbac/users/:userId
   */
  @Get("users/:userId")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async getUserDetails(@Param("userId") userId: string) {
    try {
      const details = await this.rbacService.getUserRoleDetails(userId);
      return details;
    } catch (error) {
      this.logger.error(
        `Error fetching user details: ${(error as Error).message}`
      );
      throw error;
    }
  }

  /**
   * 更新用户角色（替换所有角色）
   * PATCH /rbac/users/:userId/roles
   * Body: { roles: string[] }
   */
  @Patch("users/:userId/roles")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async updateUserRoles(
    @Param("userId") userId: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: JwtReq
  ) {
    const requesterId = req?.user?.userId;
    if (!requesterId) throw new UnauthorizedException();

    // 防止修改自己
    if (userId === requesterId) {
      throw new ForbiddenException("Cannot modify your own roles");
    }

    // 验证提供的角色有效
    const validRoles = Object.values(UserRole);
    const invalidRoles = dto.roles.filter((r: string) => !validRoles.includes(r as UserRole));
    if (invalidRoles.length > 0) {
      throw new ForbiddenException(`Invalid roles: ${invalidRoles.join(", ")}`);
    }

    try {
      await this.rbacService.updateUserRoles(
        userId,
        dto.roles as UserRole[],
        requesterId
      );

      return {
        success: true,
        userId,
        roles: dto.roles,
        message: `Updated roles for user ${userId}`,
      };
    } catch (error) {
      this.logger.error(
        `Error updating user roles: ${(error as Error).message}`
      );
      throw error;
    }
  }

  /**
   * 分配单个角色给用户
   * POST /rbac/users/:userId/role
   * Body: { roleCode: string, expiresAt?: string, grantedBy?: string}
   */
  @Post("users/:userId/role")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async assignRole(
    @Param("userId") userId: string,
    @Body("roleCode") roleCode: string,
    @Body("expiresAt") expiresAt?: string,
    @Req() req?: JwtReq
  ) {
    const requesterId = req?.user?.userId;

    // 验证角色有效
    if (!Object.values(UserRole).includes(roleCode as UserRole)) {
      throw new ForbiddenException(`Invalid role: ${roleCode}`);
    }

    try {
      const expiryDate = expiresAt ? new Date(expiresAt) : undefined;
      await this.rbacService.assignRoleToUser(
        userId,
        roleCode as UserRole,
        requesterId,
        expiryDate
      );

      return {
        success: true,
        userId,
        roleCode,
        expiresAt: expiryDate,
        message: `Assigned role ${roleCode} to user ${userId}`,
      };
    } catch (error) {
      this.logger.error(`Error assigning role: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 移除用户的单个角色
   * DELETE /rbac/users/:userId/role/:roleCode
   */
  @Delete("users/:userId/role/:roleCode")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async removeRole(
    @Param("userId") userId: string,
    @Param("roleCode") roleCode: string,
    @Req() req: JwtReq
  ) {
    const requesterId = req.user?.userId;
    if (!requesterId) throw new UnauthorizedException();

    // 防止移除自己的所有角色
    if (userId === requesterId) {
      throw new ForbiddenException("Cannot revoke your own roles");
    }

    // 不允许移除REGULAR_USER角色（所有人都应有）
    if (roleCode === UserRole.REGULAR_USER) {
      throw new ForbiddenException(
        `Cannot revoke ${UserRole.REGULAR_USER} role`
      );
    }

    try {
      await this.rbacService.removeRoleFromUser(
        userId,
        roleCode as UserRole,
        requesterId,
      );

      return {
        success: true,
        userId,
        roleCode,
        message: `Removed role ${roleCode} from user ${userId}`,
      };
    } catch (error) {
      this.logger.error(`Error removing role: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取某个角色的所有权限
   * GET /rbac/role/:roleCode/permissions
   */
  @Get("role/:roleCode/permissions")
  @RequirePermission(Permission.MANAGE_PERMISSIONS)
  async getRolePermissions(@Param("roleCode") roleCode: string) {
    // 验证角色有效
    if (!Object.values(UserRole).includes(roleCode as UserRole)) {
      throw new ForbiddenException(`Invalid role: ${roleCode}`);
    }

    try {
      const permissions = await this.rbacService.getPermissionsForRole(
        roleCode as UserRole
      );

      return {
        roleCode,
        permissions,
        count: permissions.length,
      };
    } catch (error) {
      this.logger.error(`Error fetching role permissions: ${(error as Error).message}`);
      throw error;
    }
  }
}

