import type { IUser } from '../modules/users/models/user.model';
import type { IUserProfile } from '../modules/users/models/user-profile.model';
import type { IUserSession } from '../modules/users/models/user-session.model';
import { getPermissionsForRole } from '../constants/permissions';
import type { UserRole } from '../modules/shared/constants';

type LeanUser = IUser & { _id: { toString(): string } };
type LeanProfile = IUserProfile & { _id: { toString(): string } };
type LeanSession = IUserSession & { _id: { toString(): string } };

export function serializeUser(user: LeanUser) {
  return {
    id: user._id.toString(),
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
    authProvider: user.authProvider,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    permissions: getPermissionsForRole(user.role as UserRole),
  };
}

export function serializeProfile(profile: LeanProfile | null | undefined) {
  if (!profile) return null;
  return {
    id: profile._id.toString(),
    userId: profile.userId.toString(),
    fullName: profile.fullName,
    displayName: profile.displayName ?? null,
    avatar: profile.avatar
      ? {
          storageKey: profile.avatar.storageKey,
          url: profile.avatar.url ?? null,
          mimeType: profile.avatar.mimeType ?? null,
          sizeBytes: profile.avatar.sizeBytes ?? null,
        }
      : null,
    dateOfBirth: profile.dateOfBirth ?? null,
    gender: profile.gender ?? null,
    education: profile.education ?? null,
    location: profile.location ?? null,
    preferences: profile.preferences ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function serializeAuthMe(user: LeanUser, profile: LeanProfile | null | undefined) {
  return {
    ...serializeUser(user),
    profile: serializeProfile(profile),
  };
}

export function serializeSession(
  session: LeanSession,
  currentSessionId?: string
) {
  return {
    id: session._id.toString(),
    deviceName: session.device?.deviceName ?? null,
    platform: session.device?.platform ?? null,
    appVersion: session.device?.appVersion ?? null,
    lastUsedAt: session.lastUsedAt,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt ?? null,
    isCurrent: currentSessionId ? session._id.toString() === currentSessionId : false,
  };
}
