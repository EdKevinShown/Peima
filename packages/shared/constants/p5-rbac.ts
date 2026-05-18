/**
 * P5 RBAC — role codes align with `user_roles.role_code` / `role_permissions.role_code`.
 * Permission codes align with `role_permissions.permission_code`.
 */

export const UserRole = {
  REGULAR_USER: "REGULAR_USER",
  OPERATOR: "OPERATOR",
  DATA_ANALYST: "DATA_ANALYST",
  ADMIN: "ADMIN",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Permission = {
  VIEW_OWN_SUGGESTIONS: "view_own_suggestions",
  VIEW_ALL_SUGGESTIONS: "view_all_suggestions",
  MANAGE_ALL_SUGGESTIONS: "manage_all_suggestions",
  EXPORT_SUGGESTIONS: "export_suggestions",
  VIEW_GLOBAL_ANALYTICS: "view_global_analytics",
  MANAGE_PERMISSIONS: "manage_permissions",
  VIEW_AUDIT_LOG: "view_audit_log",
  EXPORT_DATA: "export_data",
  /** P7.4-r1d-c2: onboarding photo review (admin / operator). */
  MANAGE_PHOTO_REVIEW: "manage_photo_review",
  /** P7.6-r8g1: read-only P7.6 allowlist apply sidecar (admin review). */
  VIEW_P76_ALLOWLIST_APPLY_META: "view_p76_allowlist_apply_meta",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS_MAP: Record<UserRole, Permission[]> = {
  [UserRole.REGULAR_USER]: [Permission.VIEW_OWN_SUGGESTIONS],
  [UserRole.OPERATOR]: [
    Permission.VIEW_OWN_SUGGESTIONS,
    Permission.VIEW_ALL_SUGGESTIONS,
    Permission.MANAGE_ALL_SUGGESTIONS,
    Permission.EXPORT_SUGGESTIONS,
    Permission.MANAGE_PHOTO_REVIEW,
    Permission.VIEW_P76_ALLOWLIST_APPLY_META,
  ],
  [UserRole.DATA_ANALYST]: [
    Permission.VIEW_OWN_SUGGESTIONS,
    Permission.VIEW_GLOBAL_ANALYTICS,
    Permission.VIEW_ALL_SUGGESTIONS,
    Permission.EXPORT_DATA,
    Permission.VIEW_P76_ALLOWLIST_APPLY_META,
  ],
  [UserRole.ADMIN]: [
    Permission.VIEW_OWN_SUGGESTIONS,
    Permission.VIEW_ALL_SUGGESTIONS,
    Permission.MANAGE_ALL_SUGGESTIONS,
    Permission.EXPORT_SUGGESTIONS,
    Permission.VIEW_GLOBAL_ANALYTICS,
    Permission.MANAGE_PERMISSIONS,
    Permission.VIEW_AUDIT_LOG,
    Permission.EXPORT_DATA,
    Permission.MANAGE_PHOTO_REVIEW,
    Permission.VIEW_P76_ALLOWLIST_APPLY_META,
  ],
};

export function getPermissionsForRoles(roles: UserRole[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    const list = ROLE_PERMISSIONS_MAP[role];
    if (list) {
      for (const p of list) {
        set.add(p);
      }
    }
  }
  return Array.from(set);
}

export function hasPermission(roles: UserRole[], permission: Permission): boolean {
  return getPermissionsForRoles(roles).includes(permission);
}

function parseIdList(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Env-based role hints (merged in DB by RbacService). Uses JWT `sub` / user id (cuid).
 */
export function getRolesFromEnv(userId: string): UserRole[] {
  const roles: UserRole[] = [];
  const admins = parseIdList(process.env.PEIMA_ADMIN_USER_IDS);
  const operators = parseIdList(process.env.PEIMA_OPERATOR_USER_IDS);
  const analysts = parseIdList(process.env.PEIMA_DATA_ANALYST_USER_IDS);

  if (admins.includes(userId)) {
    roles.push(UserRole.ADMIN);
  }
  if (operators.includes(userId)) {
    roles.push(UserRole.OPERATOR);
  }
  if (analysts.includes(userId)) {
    roles.push(UserRole.DATA_ANALYST);
  }
  return roles;
}
