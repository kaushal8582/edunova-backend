import type { Request } from 'express';
import mongoose from 'mongoose';
import { getEnv } from '../../../config/env';
import { getRedis, RedisKeys } from '../../../config/redis';
import {
  AuthProvider,
  DevicePlatform,
  PUBLIC_REGISTRATION_ROLE,
  UserStatus,
} from '../../shared/constants';
import { EmailVerification } from '../models/email-verification.model';
import { PasswordResetToken } from '../models/password-reset-token.model';
import { User } from '../../users/models/user.model';
import { UserProfile } from '../../users/models/user-profile.model';
import { UserSession } from '../../users/models/user-session.model';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../../../services/email/email.service';
import { ApiError } from '../../../utils/ApiError';
import { getClientIp, getUserAgent, isTrustedMobileClient } from '../../../utils/client';
import { generateNumericOtp, generateSecureToken, hashToken } from '../../../utils/crypto';
import { assertPasswordMatch, hashPassword } from '../../../utils/password';
import { isDuplicateKeyError, withOptionalTransaction } from '../../../utils/mongo';
import { serializeAuthMe, serializeSession, serializeUser } from '../../../utils/serializers';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../validators/auth.validators';
import {
  createSession,
  issueAccessToken,
  revokeAllUserSessions,
  revokeSession,
  rotateRefreshToken,
} from './session.service';
import { signRefreshToken, verifyRefreshToken } from '../../../utils/token';

function genericAuthMessage(): never {
  throw ApiError.unauthorized('Invalid credentials');
}

async function storeEmailVerificationOtp(params: {
  userId: mongoose.Types.ObjectId | string;
  email: string;
  otp: string;
}): Promise<void> {
  const env = getEnv();
  const tokenHash = hashToken(params.otp);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_OTP_TTL_SECONDS * 1000);

  const redis = getRedis();
  await redis.set(
    RedisKeys.emailOtp(params.email),
    tokenHash,
    'EX',
    env.EMAIL_VERIFICATION_OTP_TTL_SECONDS
  );

  await EmailVerification.updateMany(
    { userId: params.userId, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  await EmailVerification.create({
    userId: params.userId,
    email: params.email,
    tokenHash,
    expiresAt,
  });
}

export async function registerUser(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);
  const education = input.education;

  

  try {
    const { user, profile } = await withOptionalTransaction(async (session) => {
      const userPayload = {
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: PUBLIC_REGISTRATION_ROLE,
        status: UserStatus.PENDING_VERIFICATION,
        authProvider: AuthProvider.LOCAL,
        emailVerified: false,
        phoneVerified: false,
      };

      const userDocs = session
        ? await User.create([userPayload], { session })
        : [await User.create(userPayload)];

      const user = userDocs[0]!;

      const profilePayload = {
        userId: user._id,
        fullName: input.fullName,
      };

      const profileDocs = session
        ? await UserProfile.create([profilePayload], { session })
        : [await UserProfile.create(profilePayload)];

      return { user, profile: profileDocs[0]! };
    });

    const otp = generateNumericOtp(6);
    await storeEmailVerificationOtp({
      userId: user._id,
      email: user.email,
      otp,
    });

    await sendVerificationEmail({
      to: user.email,
      fullName: profile.fullName,
      otp,
    });

    return {
      user: serializeUser(user.toObject()),
      profile: {
        fullName: profile.fullName,
      },
      // Never return OTP/token in production responses.
      ...(getEnv().NODE_ENV !== 'production' && getEnv().NODE_ENV !== 'test'
        ? {}
        : {}),
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('An account with this email or phone already exists');
    }
    throw error;
  }
}

export async function verifyEmail(input: VerifyEmailInput) {
  const user = await User.findOne({ email: input.email });
  if (!user || user.status === UserStatus.DELETED) {
    throw ApiError.badRequest('Invalid or expired verification token');
  }

  if (user.emailVerified && user.status === UserStatus.ACTIVE) {
    return { emailVerified: true, status: user.status };
  }

  const presentedHash = hashToken(input.token);
  const redis = getRedis();
  const redisHash = await redis.get(RedisKeys.emailOtp(input.email));

  let valid = Boolean(redisHash && redisHash === presentedHash);

  const record = await EmailVerification.findOne({
    userId: user._id,
    email: input.email,
    tokenHash: presentedHash,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!valid) {
    if (
      !record ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw ApiError.badRequest('Invalid or expired verification token');
    }
    valid = true;
  } else if (record && record.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('Invalid or expired verification token');
  }

  const now = new Date();
  user.emailVerified = true;
  if (user.status === UserStatus.PENDING_VERIFICATION) {
    user.status = UserStatus.ACTIVE;
  }
  await user.save();

  if (record) {
    record.consumedAt = now;
    await record.save();
  } else {
    await EmailVerification.updateMany(
      { userId: user._id, tokenHash: presentedHash, consumedAt: null },
      { $set: { consumedAt: now } }
    );
  }

  await redis.del(RedisKeys.emailOtp(input.email));

  return {
    emailVerified: true,
    status: user.status,
  };
}

export async function resendVerification(input: ResendVerificationInput) {
  const env = getEnv();
  const redis = getRedis();
  const cooldownKey = RedisKeys.emailOtpCooldown(input.email);
  const cooldown = await redis.get(cooldownKey);

  // Generic response regardless of account state (anti-enumeration).
  const generic = {
    message: 'If an account requires verification, a new code has been sent.',
  };

  if (cooldown) {
    throw ApiError.tooManyRequests('Please wait before requesting another verification code.');
  }

  const user = await User.findOne({ email: input.email });
  if (!user || user.emailVerified || user.status === UserStatus.DELETED) {
    return generic;
  }

  const profile = await UserProfile.findOne({ userId: user._id }).lean();
  const otp = generateNumericOtp(6);
  await storeEmailVerificationOtp({ userId: user._id, email: user.email, otp });
  await redis.set(cooldownKey, '1', 'EX', env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS);

  await sendVerificationEmail({
    to: user.email,
    fullName: profile?.fullName ?? 'User',
    otp,
  });

  return generic;
}

export async function loginUser(input: LoginInput, req: Request) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user || user.authProvider !== AuthProvider.LOCAL) {
    genericAuthMessage();
  }

  await assertPasswordMatch(user.passwordHash, input.password);

  if (user.status === UserStatus.PENDING_VERIFICATION) {
    throw ApiError.forbidden('Please verify your email before logging in');
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw ApiError.forbidden('Account is suspended');
  }
  if (user.status === UserStatus.DELETED) {
    genericAuthMessage();
  }

  const tokens = await createSession({
    userId: user._id,
    role: user.role,
    device: {
      ...input.device,
      platform: input.device.platform as DevicePlatform,
    },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  user.lastLoginAt = new Date();
  await user.save();

  const profile = await UserProfile.findOne({ userId: user._id }).lean();
  const safeUser = serializeAuthMe(
    {
      ...user.toObject(),
      passwordHash: undefined,
    },
    profile
  );

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
    user: safeUser,
    deliverRefreshInBody: isTrustedMobileClient(req),
  };
}

export async function refreshTokens(req: Request) {
  const env = getEnv();
  const rawFromCookie = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  const rawFromBody =
    typeof req.body?.refreshToken === 'string' ? (req.body.refreshToken as string) : undefined;

  const mobile = isTrustedMobileClient(req);
  const raw = mobile ? rawFromBody || rawFromCookie : rawFromCookie || rawFromBody;

  if (!raw) {
    throw ApiError.unauthorized('Refresh token required');
  }

  const rotated = await rotateRefreshToken(raw);
  const user = await User.findById(rotated.userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    await revokeAllUserSessions(rotated.userId);
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const accessToken = issueAccessToken({
    userId: user._id.toString(),
    role: user.role,
    sessionId: rotated.sessionId,
  });

  return {
    accessToken,
    refreshToken: rotated.refreshToken,
    sessionId: rotated.sessionId,
    deliverRefreshInBody: mobile,
  };
}

export async function logoutCurrentSession(req: Request): Promise<void> {
  const env = getEnv();
  if (req.user?.sessionId) {
    await revokeSession(req.user.sessionId, req.user.id);
    return;
  }

  const raw =
    (req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined) ||
    (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);

  if (!raw) {
    return;
  }

  try {
    const payload = verifyRefreshToken(raw);
    await revokeSession(payload.sid, payload.sub);
  } catch {
    // Idempotent logout
  }
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await revokeAllUserSessions(userId);
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const env = getEnv();
  const redis = getRedis();
  const cooldownKey = RedisKeys.passwordResetCooldown(input.email);

  if (await redis.get(cooldownKey)) {
    // Still return generic success to avoid enumeration, but apply cooldown.
    return {
      message: 'If an account exists for that email, a reset link has been sent.',
    };
  }

  await redis.set(cooldownKey, '1', 'EX', 60);

  const user = await User.findOne({ email: input.email });
  if (user && user.status !== UserStatus.DELETED && user.authProvider === AuthProvider.LOCAL) {
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_SECONDS * 1000);

    await PasswordResetToken.updateMany(
      { userId: user._id, consumedAt: null },
      { $set: { consumedAt: new Date() } }
    );

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    const profile = await UserProfile.findOne({ userId: user._id }).lean();
    await sendPasswordResetEmail({
      to: user.email,
      fullName: profile?.fullName ?? 'User',
      resetToken: rawToken,
    });
  }

  return {
    message: 'If an account exists for that email, a reset link has been sent.',
  };
}

export async function resetPassword(input: ResetPasswordInput) {
  const tokenHash = hashToken(input.token);
  const record = await PasswordResetToken.findOne({
    tokenHash,
    consumedAt: null,
  });

  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  const user = await User.findById(record.userId).select('+passwordHash');
  if (!user || user.status === UserStatus.DELETED) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  record.consumedAt = new Date();
  await record.save();

  await revokeAllUserSessions(user._id.toString());

  return { passwordReset: true };
}

export async function changePassword(userId: string, sessionId: string, input: ChangePasswordInput) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw ApiError.unauthorized();
  }

  await assertPasswordMatch(user.passwordHash, input.currentPassword);

  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  // Revoke every other session; rotate current session credentials.
  await revokeAllUserSessions(userId, { exceptSessionId: sessionId });

  const session = await UserSession.findById(sessionId);
  if (!session || session.revokedAt || session.userId.toString() !== userId) {
    await revokeAllUserSessions(userId);
    throw ApiError.unauthorized('Session expired. Please log in again.');
  }

  const refreshToken = signRefreshToken({
    sub: userId,
    sid: sessionId,
    fid: session.tokenFamilyId,
  });
  session.refreshTokenHash = hashToken(refreshToken);
  session.lastUsedAt = new Date();
  await session.save();

  const accessToken = issueAccessToken({
    userId,
    role: user.role,
    sessionId,
  });

  return { accessToken, refreshToken };
}

export async function getCurrentUser(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw ApiError.unauthorized();
  }
  const profile = await UserProfile.findOne({ userId }).lean();
  return serializeAuthMe(user, profile);
}

export async function listUserSessions(userId: string, currentSessionId?: string) {
  const sessions = await UserSession.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .lean();

  return sessions.map((s) => serializeSession(s, currentSessionId));
}

export async function revokeOwnSession(
  userId: string,
  sessionId: string,
  currentSessionId?: string
): Promise<{ revokedCurrent: boolean }> {
  const session = await UserSession.findOne({ _id: sessionId, userId });
  if (!session) {
    throw ApiError.notFound('Session not found');
  }

  if (!session.revokedAt) {
    session.revokedAt = new Date();
    await session.save();
  }

  return { revokedCurrent: currentSessionId === sessionId };
}
