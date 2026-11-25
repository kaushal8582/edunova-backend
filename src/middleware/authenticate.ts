import type { NextFunction, Request, Response } from 'express';
import { User } from '../modules/users/models/user.model';
import { UserStatus } from '../modules/shared/constants';
import { getPermissionsForRole } from '../constants/permissions';
import type { AuthenticatedUser } from '../types/express';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/token';

function extractBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authentication required');
  }

  const payload = verifyAccessToken(token);

  const user = await User.findById(payload.sub).lean();
  if (!user) {
    throw ApiError.unauthorized('Authentication required');
  }

  if (
    user.status === UserStatus.SUSPENDED ||
    user.status === UserStatus.DELETED ||
    user.status === UserStatus.PENDING_VERIFICATION
  ) {
    throw ApiError.forbidden('Account is not allowed to access this resource');
  }

  if (user.passwordChangedAt && payload.iat) {
    const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAtSec) {
      throw ApiError.unauthorized('Session expired. Please log in again.');
    }
  }

  const authUser: AuthenticatedUser = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    sessionId: payload.sid,
    permissions: getPermissionsForRole(user.role),
  };

  req.user = authUser;
  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).lean();
    if (
      user &&
      user.status === UserStatus.ACTIVE
    ) {
      req.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        sessionId: payload.sid,
        permissions: getPermissionsForRole(user.role),
      };
    }
  } catch {
    // Optional auth: ignore invalid tokens.
  }

  next();
});

export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(ApiError.unauthorized());
    return;
  }
  if (!req.user.emailVerified) {
    next(ApiError.forbidden('Email verification required'));
    return;
  }
  next();
}

export function requireActiveAccount(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(ApiError.unauthorized());
    return;
  }
  if (req.user.status !== UserStatus.ACTIVE) {
    next(ApiError.forbidden('Account is not active'));
    return;
  }
  next();
}
