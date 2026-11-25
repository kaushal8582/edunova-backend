import type { NextFunction, Request, Response } from 'express';
import { getEnv, isProduction } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { generateSecureToken, timingSafeEqualString } from '../utils/crypto';
import { isTrustedMobileClient } from '../utils/client';

/**
 * Double-submit CSRF protection for cookie-authenticated mutation endpoints
 * (refresh / logout). Mobile clients that do not use cookies are skipped.
 */
export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction): void {
  if (isTrustedMobileClient(req)) {
    next();
    return;
  }

  const env = getEnv();
  const existing = req.cookies?.[env.CSRF_COOKIE_NAME];
  if (!existing) {
    const token = generateSecureToken(24);
    res.cookie(env.CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: env.COOKIE_SECURE ?? isProduction(),
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN,
      path: '/',
    });
  }
  next();
}

export function requireCsrfForCookieAuth(req: Request, _res: Response, next: NextFunction): void {
  if (isTrustedMobileClient(req)) {
    next();
    return;
  }

  // If refresh token is not coming from cookie, CSRF is not required.
  const env = getEnv();
  const cookieToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!cookieToken) {
    next();
    return;
  }

  const csrfCookie = req.cookies?.[env.CSRF_COOKIE_NAME];
  const csrfHeader = req.get('x-csrf-token');

  if (
    !csrfCookie ||
    !csrfHeader ||
    !timingSafeEqualString(String(csrfCookie), String(csrfHeader))
  ) {
    next(ApiError.forbidden('Invalid CSRF token'));
    return;
  }

  next();
}
