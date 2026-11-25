import { UserRole } from '../modules/shared/constants';

/**
 * Central permission catalog. Controllers must authorize via these keys —
 * never by comparing role strings inline for access control.
 */
export const Permission = {
  USER_READ: 'USER_READ',
  USER_UPDATE: 'USER_UPDATE',
  USER_SUSPEND: 'USER_SUSPEND',
  USER_ACTIVATE: 'USER_ACTIVATE',
  USER_SESSION_READ: 'USER_SESSION_READ',
  USER_SESSION_REVOKE: 'USER_SESSION_REVOKE',
  ADMIN_CREATE: 'ADMIN_CREATE',
  ADMIN_ROLE_UPDATE: 'ADMIN_ROLE_UPDATE',
  BOOK_READ: 'BOOK_READ',
  BOOK_CREATE: 'BOOK_CREATE',
  BOOK_UPDATE: 'BOOK_UPDATE',
  BOOK_PUBLISH: 'BOOK_PUBLISH',
  BOOK_DELETE: 'BOOK_DELETE',
  AUDIT_LOG_READ: 'AUDIT_LOG_READ',
  PLATFORM_SETTINGS_UPDATE: 'PLATFORM_SETTINGS_UPDATE',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
export const PERMISSIONS = Object.values(Permission);

const ALL_PERMISSIONS = [...PERMISSIONS];

const CONTENT_ADMIN_PERMISSIONS: Permission[] = [
  Permission.USER_READ,
  Permission.USER_SESSION_READ,
  Permission.BOOK_READ,
  Permission.BOOK_CREATE,
  Permission.BOOK_UPDATE,
  Permission.BOOK_PUBLISH,
  Permission.BOOK_DELETE,
];

/**
 * SUPPORT_ADMIN may suspend/activate VIEWER accounts only (enforced in service
 * layer after permission check). They cannot create admins or change roles.
 */
const SUPPORT_ADMIN_PERMISSIONS: Permission[] = [
  Permission.USER_READ,
  Permission.USER_SUSPEND,
  Permission.USER_ACTIVATE,
  Permission.USER_SESSION_READ,
  Permission.USER_SESSION_REVOKE,
  Permission.BOOK_READ, // read-only book info for support
];

/** VIEWER has no admin permissions — self-service routes use authenticate only. */
const VIEWER_PERMISSIONS: Permission[] = [];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [UserRole.CONTENT_ADMIN]: CONTENT_ADMIN_PERMISSIONS,
  [UserRole.SUPPORT_ADMIN]: SUPPORT_ADMIN_PERMISSIONS,
  [UserRole.VIEWER]: VIEWER_PERMISSIONS,
};

export function getPermissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

export function roleHasAllPermissions(
  role: UserRole,
  permissions: readonly Permission[]
): boolean {
  const granted = new Set(getPermissionsForRole(role));
  return permissions.every((p) => granted.has(p));
}

/** Roles that may be created via POST /admin/admins (never SUPER_ADMIN). */
export const CREATABLE_ADMIN_ROLES = [
  UserRole.CONTENT_ADMIN,
  UserRole.SUPPORT_ADMIN,
] as const;

export type CreatableAdminRole = (typeof CREATABLE_ADMIN_ROLES)[number];
