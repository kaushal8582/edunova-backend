import type { Response } from 'express';
import { getEnv, isProduction } from '../config/env';
import { getRefreshTokenTtlMs } from './token';

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  const env = getEnv();
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE ?? isProduction(),
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/api/v1/auth',
    maxAge: getRefreshTokenTtlMs(),
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  const env = getEnv();
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE ?? isProduction(),
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/api/v1/auth',
  });
}
