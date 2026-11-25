import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { getEnv, isProduction } from '../config/env';
import { ApiError, isApiError } from '../utils/ApiError';
import { sendError } from '../utils/ApiResponse';
import { getDuplicateKeyFields, isDuplicateKeyError } from '../utils/mongo';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isApiError(err)) {
    sendError(res, err.statusCode, err.message, err.errors, err.code);
    return;
  }

  if (err instanceof ZodError) {
    sendError(
      res,
      400,
      'Validation failed',
      err.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
      })),
      'VALIDATION_ERROR'
    );
    return;
  }

  if (isDuplicateKeyError(err)) {
    const fields = getDuplicateKeyFields(err);
    sendError(
      res,
      409,
      'A record with the same unique value already exists',
      fields.map((field) => ({ field, message: `${field} already exists` })),
      'DUPLICATE_KEY'
    );
    return;
  }

  if (!isProduction()) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[error]', err);
    sendError(res, 500, message, [], 'INTERNAL');
    return;
  }

  // Never expose stack traces or internal details in production.
  void getEnv();
  sendError(res, 500, 'Internal server error', [], 'INTERNAL');
}
