import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '../constants/permissions';
import { roleHasAllPermissions, roleHasPermission } from '../constants/permissions';
import { ApiError } from '../utils/ApiError';

/** Requires every listed permission. */
export function authorize(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    const ok =
      required.length === 1
        ? roleHasPermission(req.user.role, required[0]!)
        : roleHasAllPermissions(req.user.role, required);

    if (!ok) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };
}

/** Requires at least one of the listed permissions. */
export function authorizeAny(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    const ok = required.some((permission) => roleHasPermission(req.user!.role, permission));
    if (!ok) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };
}
