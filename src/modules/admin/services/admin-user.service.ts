import { AuthProvider, AdminAuditAction, UserRole, UserStatus } from '../../shared/constants';
import { User } from '../../users/models/user.model';
import { UserProfile } from '../../users/models/user-profile.model';
import { UserSession } from '../../users/models/user-session.model';
import { CREATABLE_ADMIN_ROLES, Permission, roleHasPermission } from '../../../constants/permissions';
import { sendAdminInviteEmail, sendVerificationEmail } from '../../../services/email/email.service';
import { ApiError } from '../../../utils/ApiError';
import { generateNumericOtp, hashToken } from '../../../utils/crypto';
import { hashPassword } from '../../../utils/password';
import { isDuplicateKeyError, isValidObjectId } from '../../../utils/mongo';
import { serializeProfile, serializeSession, serializeUser } from '../../../utils/serializers';
import { getRedis, RedisKeys } from '../../../config/redis';
import { getEnv } from '../../../config/env';
import { EmailVerification } from '../../auth/models/email-verification.model';
import { writeAdminAuditLog } from './audit.service';
import type {
  ChangeRoleInput,
  CreateAdminInput,
  ListUsersQuery,
  UpdateUserStatusInput,
} from '../validators/admin-user.validators';
import { revokeAllUserSessions, revokeSession } from '../../auth/services/session.service';

function assertObjectId(userId: string): void {
  if (!isValidObjectId(userId)) {
    throw ApiError.badRequest('Invalid user id');
  }
}

export async function listUsers(query: ListUsersQuery) {
  const filter: Record<string, unknown> = {};

  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.emailVerified !== undefined) filter.emailVerified = query.emailVerified;

  if (query.search) {
    const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const profileMatches = await UserProfile.find({
      $or: [{ fullName: regex }, { displayName: regex }],
    })
      .select('userId')
      .lean();

    filter.$or = [
      { email: regex },
      { phone: regex },
      { _id: { $in: profileMatches.map((p) => p.userId) } },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const sort: Record<string, 1 | -1> = {
    [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1,
  };

  const [users, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    User.countDocuments(filter),
  ]);

  const profiles = await UserProfile.find({
    userId: { $in: users.map((u) => u._id) },
  }).lean();
  const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));

  return {
    items: users.map((user) => ({
      ...serializeUser(user),
      fullName: profileByUser.get(user._id.toString())?.fullName ?? null,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
    },
  };
}

export async function getUserDetails(userId: string) {
  assertObjectId(userId);
  const user = await User.findById(userId).lean();
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const [profile, activeSessionCount] = await Promise.all([
    UserProfile.findOne({ userId }).lean(),
    UserSession.countDocuments({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }),
  ]);

  return {
    user: serializeUser(user),
    profile: serializeProfile(profile),
    activeSessionCount,
  };
}

export async function updateUserStatus(params: {
  actor: { id: string; role: UserRole };
  userId: string;
  input: UpdateUserStatusInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertObjectId(params.userId);

  if (params.actor.id === params.userId) {
    throw ApiError.forbidden('You cannot change your own account status');
  }

  const user = await User.findById(params.userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden("SUPER_ADMIN status cannot be changed through ordinary admin operations");
  }

  if (params.input.status === UserStatus.SUSPENDED) {
    if (!roleHasPermission(params.actor.role, Permission.USER_SUSPEND)) {
      throw ApiError.forbidden();
    }
  }
  if (params.input.status === UserStatus.ACTIVE) {
    if (!roleHasPermission(params.actor.role, Permission.USER_ACTIVATE)) {
      throw ApiError.forbidden();
    }
  }

  // SUPPORT_ADMIN may only suspend/activate VIEWER accounts.
  if (params.actor.role === UserRole.SUPPORT_ADMIN && user.role !== UserRole.VIEWER) {
    throw ApiError.forbidden('SUPPORT_ADMIN may only change status for VIEWER accounts');
  }

  const previousStatus = user.status;
  user.status = params.input.status as typeof user.status;
  await user.save();

  if (params.input.status === UserStatus.SUSPENDED) {
    await revokeAllUserSessions(user._id.toString());
  }

  await writeAdminAuditLog({
    adminId: params.actor.id,
    action:
      params.input.status === UserStatus.SUSPENDED
        ? AdminAuditAction.USER_SUSPEND
        : AdminAuditAction.USER_ACTIVATE,
    resourceType: 'User',
    resourceId: user._id,
    changes: {
      before: { status: previousStatus },
      after: { status: user.status },
      meta: { reason: params.input.reason },
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeUser(user.toObject());
}

export async function createAdmin(params: {
  actorId: string;
  input: CreateAdminInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!(CREATABLE_ADMIN_ROLES as readonly string[]).includes(params.input.role)) {
    throw ApiError.forbidden('Only CONTENT_ADMIN and SUPPORT_ADMIN can be created via this endpoint');
  }

  const passwordHash = await hashPassword(params.input.password);

  try {
    const user = await User.create({
      email: params.input.email,
      passwordHash,
      role: params.input.role as UserRole,
      status: UserStatus.PENDING_VERIFICATION,
      authProvider: AuthProvider.LOCAL,
      emailVerified: false,
      phoneVerified: false,
    });

    const profile = await UserProfile.create({
      userId: user._id,
      fullName: params.input.fullName,
    });

    const otp = generateNumericOtp(6);
    const env = getEnv();
    const tokenHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_OTP_TTL_SECONDS * 1000);

    const redis = getRedis();
    await redis.set(
      RedisKeys.emailOtp(user.email),
      tokenHash,
      'EX',
      env.EMAIL_VERIFICATION_OTP_TTL_SECONDS
    );

    await EmailVerification.create({
      userId: user._id,
      email: user.email,
      tokenHash,
      expiresAt,
    });

    await sendVerificationEmail({
      to: user.email,
      fullName: profile.fullName,
      otp,
    });

    await sendAdminInviteEmail({
      to: user.email,
      fullName: profile.fullName,
      role: user.role,
    });

    await writeAdminAuditLog({
      adminId: params.actorId,
      action: AdminAuditAction.USER_CREATE,
      resourceType: 'User',
      resourceId: user._id,
      changes: {
        after: { email: user.email, role: user.role, status: user.status },
        meta: { kind: 'admin_create' },
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return {
      user: serializeUser(user.toObject()),
      profile: serializeProfile(profile.toObject()),
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw error;
  }
}

export async function changeUserRole(params: {
  actorId: string;
  userId: string;
  input: ChangeRoleInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertObjectId(params.userId);

  if (params.actorId === params.userId) {
    throw ApiError.forbidden('You cannot change your own role through this endpoint');
  }

  const user = await User.findById(params.userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Never allow promoting to SUPER_ADMIN via API.
  if (params.input.role === UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden('SUPER_ADMIN must be provisioned through a secure seed process');
  }

  if (user.role === UserRole.SUPER_ADMIN && params.input.role !== UserRole.SUPER_ADMIN) {
    const activeSuperAdmins = await User.countDocuments({
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
    if (activeSuperAdmins <= 1) {
      throw ApiError.forbidden('Cannot demote the last active SUPER_ADMIN');
    }
  }

  const previousRole = user.role;
  user.role = params.input.role as typeof user.role;
  await user.save();

  await writeAdminAuditLog({
    adminId: params.actorId,
    action: AdminAuditAction.ROLE_CHANGE,
    resourceType: 'User',
    resourceId: user._id,
    changes: {
      before: { role: previousRole },
      after: { role: user.role },
      meta: { reason: params.input.reason },
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeUser(user.toObject());
}

export async function listUserSessionsForAdmin(params: {
  actorId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertObjectId(params.userId);
  const user = await User.findById(params.userId).lean();
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const sessions = await UserSession.find({ userId: params.userId })
    .sort({ lastUsedAt: -1 })
    .lean();

  return sessions.map((s) => serializeSession(s));
}

export async function revokeUserSessionForAdmin(params: {
  actorId: string;
  userId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertObjectId(params.userId);
  assertObjectId(params.sessionId);

  const session = await UserSession.findOne({
    _id: params.sessionId,
    userId: params.userId,
  });
  if (!session) {
    throw ApiError.notFound('Session not found');
  }

  await revokeSession(params.sessionId, params.userId);

  await writeAdminAuditLog({
    adminId: params.actorId,
    action: 'SESSION_REVOKE',
    resourceType: 'UserSession',
    resourceId: session._id,
    changes: {
      meta: { targetUserId: params.userId },
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { revoked: true };
}
