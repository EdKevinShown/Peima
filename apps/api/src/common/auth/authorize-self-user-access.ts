import {
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import type { RbacService } from "../rbac/rbac.service";

export type AuthorizeSelfUserAccessParams = {
  tokenUserId: string | undefined;
  requestedUserId: string;
  /** When set, holders of this permission may access another user's resource. */
  adminPermission?: Permission;
};

/**
 * Ensures the caller may access a user-scoped resource.
 * - Missing auth → 401 UnauthorizedException
 * - Self → allow
 * - Other user → allow only with explicit RBAC permission (default MANAGE_PERMISSIONS)
 */
export async function authorizeSelfUserAccess(
  rbacService: RbacService,
  params: AuthorizeSelfUserAccessParams,
): Promise<void> {
  const tokenUserId = params.tokenUserId?.trim();
  const requestedUserId = params.requestedUserId?.trim();

  if (!tokenUserId) {
    throw new UnauthorizedException("not authenticated");
  }
  if (!requestedUserId) {
    throw new ForbiddenException("user id is required");
  }
  if (tokenUserId === requestedUserId) {
    return;
  }

  const adminPermission =
    params.adminPermission ?? Permission.MANAGE_PERMISSIONS;
  const allowed = await rbacService.checkPermission(
    tokenUserId,
    adminPermission,
  );
  if (!allowed) {
    throw new ForbiddenException(
      "access denied for another user's resource",
    );
  }
}
