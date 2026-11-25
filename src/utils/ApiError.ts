export type ApiErrorDetails = Array<{ field?: string; message: string }>;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: ApiErrorDetails;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(
    statusCode: number,
    message: string,
    options?: {
      errors?: ApiErrorDetails;
      code?: string;
      isOperational?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = options?.errors ?? [];
    this.code = options?.code;
    this.isOperational = options?.isOperational ?? true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message: string, errors?: ApiErrorDetails): ApiError {
    return new ApiError(400, message, { errors, code: 'BAD_REQUEST' });
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message, { code: 'NOT_FOUND' });
  }

  static conflict(message: string, errors?: ApiErrorDetails): ApiError {
    return new ApiError(409, message, { errors, code: 'CONFLICT' });
  }

  static tooManyRequests(message = 'Too many requests. Please try again later.'): ApiError {
    return new ApiError(429, message, { code: 'RATE_LIMITED' });
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message, { code: 'INTERNAL', isOperational: false });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
