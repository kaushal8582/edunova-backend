import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { ApiError } from './ApiError';
import { generateSecureToken } from './crypto';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  sid: string;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  fid: string;
  jti: string;
  typ: 'refresh';
}

function parseDurationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit]!;
}

export function getAccessTokenTtlMs(): number {
  return parseDurationToMs(getEnv().JWT_ACCESS_EXPIRES_IN);
}

export function getRefreshTokenTtlMs(): number {
  return parseDurationToMs(getEnv().JWT_REFRESH_EXPIRES_IN);
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  const env = getEnv();
  return jwt.sign({ ...payload, typ: 'access' satisfies AccessTokenPayload['typ'] }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'typ' | 'jti'> & { jti?: string }
): string {
  const env = getEnv();
  return jwt.sign(
    {
      ...payload,
      jti: payload.jti ?? generateSecureToken(12),
      typ: 'refresh' satisfies RefreshTokenPayload['typ'],
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload & jwt.JwtPayload {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_ACCESS_SECRET) as AccessTokenPayload &
      jwt.JwtPayload;
    if (decoded.typ !== 'access' || !decoded.sub || !decoded.sid) {
      throw ApiError.unauthorized('Invalid access token');
    }
    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload & jwt.JwtPayload {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_REFRESH_SECRET) as RefreshTokenPayload &
      jwt.JwtPayload;
    if (
      decoded.typ !== 'refresh' ||
      !decoded.sub ||
      !decoded.sid ||
      !decoded.fid ||
      !decoded.jti
    ) {
      throw ApiError.unauthorized('Invalid refresh token');
    }
    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
}

export function createTokenFamilyId(): string {
  return generateSecureToken(16);
}
