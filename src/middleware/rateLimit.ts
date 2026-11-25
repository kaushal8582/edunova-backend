import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError';

function createLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    // Avoid calling getEnv() at module import time (breaks vitest setup order).
    max: process.env.NODE_ENV === 'test' ? 10_000 : options.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
      throw ApiError.tooManyRequests(options.message);
    },
  });
}

export const authRegisterLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many registration attempts. Please try again later.',
});

export const authLoginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many login attempts. Please try again later.',
});

export const authVerificationLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many verification attempts. Please try again later.',
});

export const authPasswordResetLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please try again later.',
});

export const authRefreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many refresh attempts. Please try again later.',
});
