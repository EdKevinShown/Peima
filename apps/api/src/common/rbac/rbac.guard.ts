/**
 * P5：权限守卫（RBAC）
 * 使用方式：
 * @UseGuards(JwtAuthGuard, RbacGuard)
 * @RequirePermission(Permission.VIEW_GLOBAL_ANALYTICS)
 * getSomething() { ... }
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission } from "@peima/shared/constants";
import { RbacService } from "./rbac.service";

/**
 * 元数据键名：标记所需权限
 */
export const REQUIRED_PERMISSION_KEY = "required_permission";

/**
 * 装饰器：标记端点所需权限
 */
export function RequirePermission(permission: Permission) {
  return SetMetadata(REQUIRED_PERMISSION_KEY, permission);
}

/**
 * RBAC 守卫：检查用户是否拥有所需权限
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<Permission | undefined>(
      REQUIRED_PERMISSION_KEY,
      context.getHandler(),
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("User not authenticated");
    }

    // 使用 RbacService 检查权限（DB + env 合并）
    const hasAccess = await this.rbacService.checkPermission(userId, requiredPermission);

    if (!hasAccess) {
      throw new ForbiddenException(
        `Permission denied: required permission '${requiredPermission}'`,
      );
    }

    return true;
  }
}

/**
 * 多权限守卫：检查用户是否拥有任意一个所需权限（OR逻辑）
 */
export const REQUIRED_PERMISSIONS_KEY = "required_permissions";

export function RequireAnyPermission(permissions: Permission[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
}

@Injectable()
export class RbacAnyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("User not authenticated");
    }

    // 检查用户是否拥有任意一个所需权限（DB + env 合并）
    const results = await Promise.all(
      requiredPermissions.map((p) => this.rbacService.checkPermission(userId, p)),
    );
    const hasAccess = results.some(Boolean);

    if (!hasAccess) {
      throw new ForbiddenException(
        `Permission denied: required one of [${requiredPermissions.join(", ")}]`,
      );
    }

    return true;
  }
}
