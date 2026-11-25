import type { Response } from 'express';

export interface SuccessBody<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorBody {
  success: false;
  message: string;
  errors: Array<{ field?: string; message: string }>;
  code?: string;
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T = {} as T
): Response {
  const body: SuccessBody<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors: ErrorBody['errors'] = [],
  code?: string
): Response {
  const body: ErrorBody = {
    success: false,
    message,
    errors,
    ...(code ? { code } : {}),
  };
  return res.status(statusCode).json(body);
}
