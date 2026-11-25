import type { Types } from 'mongoose';
import { UserSession } from '../../users/models/user-session.model';
import { DevicePlatform } from '../../shared/constants';
import { hashToken } from '../../../utils/crypto';
import {
  createTokenFamilyId,
  getRefreshTokenTtlMs,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../../utils/token';
import { ApiError } from '../../../utils/ApiError';

export interface DeviceInfo {
  platform: DevicePlatform;
  deviceName?: string;
  appVersion?: string;
  deviceId?: string;
}

function normalizePlatform(platform: string): DevicePlatform {
  const values = Object.values(DevicePlatform) as string[];
  if (values.includes(platform)) {
    return platform as DevicePlatform;
  }
  return DevicePlatform.OTHER;
}

export async function createSession(params: {
  userId: string | Types.ObjectId;
  role: string;
  device: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const tokenFamilyId = createTokenFamilyId();
  const expiresAt = new Date(Date.now() + getRefreshTokenTtlMs());

  const [session] = await UserSession.create([
    {
      userId: params.userId,
      refreshTokenHash: 'pending',
      tokenFamilyId,
      device: {
        platform: normalizePlatform(String(params.device.platform)),
        deviceName: params.device.deviceName,
        appVersion: params.device.appVersion,
        deviceId: params.device.deviceId,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      expiresAt,
      lastUsedAt: new Date(),
    },
  ]);

  if (!session) {
    throw ApiError.internal('Failed to create session');
  }

  const sessionId = session._id.toString();
  const accessToken = signAccessToken({
    sub: params.userId.toString(),
    role: params.role,
    sid: sessionId,
  });
  const refreshToken = signRefreshToken({
    sub: params.userId.toString(),
    sid: sessionId,
    fid: tokenFamilyId,
  });

  session.refreshTokenHash = hashToken(refreshToken);
  await session.save();

  return { accessToken, refreshToken, sessionId };
}

/**
 * Atomically rotates the refresh token for a session.
 * Detects reuse when the JWT is valid for a live session but the hash no longer matches.
 */
export async function rotateRefreshToken(rawRefreshToken: string): Promise<{
  refreshToken: string;
  sessionId: string;
  userId: string;
  tokenFamilyId: string;
}> {
  const payload = verifyRefreshToken(rawRefreshToken);
  const presentedHash = hashToken(rawRefreshToken);

  const newRefreshToken = signRefreshToken({
    sub: payload.sub,
    sid: payload.sid,
    fid: payload.fid,
  });
  const newHash = hashToken(newRefreshToken);
  const now = new Date();

  const rotated = await UserSession.findOneAndUpdate(
    {
      _id: payload.sid,
      userId: payload.sub,
      tokenFamilyId: payload.fid,
      refreshTokenHash: presentedHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        refreshTokenHash: newHash,
        lastUsedAt: now,
      },
    },
    { returnDocument: 'after' }
  );

  if (rotated) {
    return {
      refreshToken: newRefreshToken,
      sessionId: rotated._id.toString(),
      userId: payload.sub,
      tokenFamilyId: payload.fid,
    };
  }

  const existing = await UserSession.findById(payload.sid).lean();
  if (
    existing &&
    existing.tokenFamilyId === payload.fid &&
    existing.userId.toString() === payload.sub &&
    !existing.revokedAt
  ) {
    await UserSession.updateMany(
      { tokenFamilyId: existing.tokenFamilyId, revokedAt: null },
      { $set: { revokedAt: now } }
    );
    throw ApiError.unauthorized('Refresh token reuse detected. Please log in again.');
  }

  throw ApiError.unauthorized('Invalid refresh token');
}

export function issueAccessToken(params: {
  userId: string;
  role: string;
  sessionId: string;
}): string {
  return signAccessToken({
    sub: params.userId,
    role: params.role,
    sid: params.sessionId,
  });
}

export async function revokeSession(sessionId: string, userId?: string): Promise<boolean> {
  const filter: Record<string, unknown> = {
    _id: sessionId,
    revokedAt: null,
  };
  if (userId) {
    filter.userId = userId;
  }

  const result = await UserSession.updateOne(filter, {
    $set: { revokedAt: new Date() },
  });

  return (result.modifiedCount ?? 0) > 0;
}

export async function revokeAllUserSessions(
  userId: string,
  options?: { exceptSessionId?: string }
): Promise<number> {
  const filter: Record<string, unknown> = {
    userId,
    revokedAt: null,
  };
  if (options?.exceptSessionId) {
    filter._id = { $ne: options.exceptSessionId };
  }

  const result = await UserSession.updateMany(filter, {
    $set: { revokedAt: new Date() },
  });

  return result.modifiedCount ?? 0;
}
