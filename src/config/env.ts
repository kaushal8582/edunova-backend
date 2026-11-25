import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v == null ? undefined : v === 'true')),
  CORS_ORIGINS: z.string().optional(),
  SMTP_HOST: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v : undefined)),
  SMTP_PORT: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  SMTP_USER: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v : undefined)),
  SMTP_PASSWORD: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v : undefined)),
  SMTP_FROM: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v : undefined)),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
  EMAIL_VERIFICATION_OTP_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  REFRESH_COOKIE_NAME: z.string().default('refreshToken'),
  CSRF_COOKIE_NAME: z.string().default('csrfToken'),

  // Object storage (S3 / R2 / local)
  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  LOCAL_STORAGE_DIR: z.string().optional(),
  STORAGE_UPLOAD_URL_EXPIRES_SECONDS: z.coerce.number().int().positive().default(900),
  STORAGE_READ_URL_EXPIRES_SECONDS: z.coerce.number().int().positive().default(300),
  MAX_PDF_BYTES: z.coerce.number().int().positive().default(104857600),
  MAX_EPUB_BYTES: z.coerce.number().int().positive().default(52428800),
  MAX_COVER_BYTES: z.coerce.number().int().positive().default(5242880),
  REQUIRE_COVER_TO_PUBLISH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  REQUIRE_CHAPTER_APPROVAL_TO_PUBLISH: z
    .string()
    .optional()
    .transform((v) => (v == null ? true : v === 'true')),
  OCR_PROVIDER: z.enum(['none', 'stub']).default('none'),
  DISABLE_BOOK_QUEUE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(overrides?: Partial<Record<keyof Env, string | number | boolean>>): Env {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getEnv(): Env {
  if (!cachedEnv) {
    return loadEnv();
  }
  return cachedEnv;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}

export function getCorsOrigins(): string[] {
  const { CORS_ORIGINS, FRONTEND_URL } = getEnv();
  if (CORS_ORIGINS) {
    return CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return [FRONTEND_URL];
}
