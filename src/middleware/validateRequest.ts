import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export function validateRequest(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const validated: Request['validated'] = {};

      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          throw ApiError.badRequest('Validation failed', formatIssues(parsed.error));
        }
        req.body = parsed.data;
        validated.body = parsed.data;
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          throw ApiError.badRequest('Validation failed', formatIssues(parsed.error));
        }
        // Express 5 query is read-only-ish; keep validated copy for handlers.
        validated.query = parsed.data;
        Object.defineProperty(req, 'query', {
          value: parsed.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          throw ApiError.badRequest('Validation failed', formatIssues(parsed.error));
        }
        req.params = parsed.data as typeof req.params;
        validated.params = parsed.data;
      }

      req.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function formatIssues(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): Array<{ field?: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || undefined,
    message: issue.message,
  }));
}
