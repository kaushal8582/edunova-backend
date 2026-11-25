import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { getRedis, RedisKeys } from '../config/redis';
import { emailOutbox } from '../services/email/email.service';
import { User } from '../modules/users/models/user.model';
import { UserProfile } from '../modules/users/models/user-profile.model';
import { UserRole, UserStatus, AuthProvider } from '../modules/shared/constants';
import { hashPassword } from '../utils/password';
import { hashToken } from '../utils/crypto';

export function buildApp(): Express {
  return createApp();
}

const DEFAULT_TEST_PASSWORD = 'Str0ng!Pass';

const DEFAULT_TEST_EDUCATION = {
  level: 'SCHOOL' as const,
  classOrYear: '11',
  institution: 'Test School',
  board: 'CBSE',
  course: 'Science',
};

export async function registerAndVerify(
  app: Express,
  overrides?: Partial<{
    fullName: string;
    email: string;
    password: string;
    phone: string;
    education: typeof DEFAULT_TEST_EDUCATION;
  }>
) {
  const payload = {
    fullName: overrides?.fullName ?? 'Test User',
    email: overrides?.email ?? `user_${Date.now()}@example.com`,
    password: overrides?.password ?? DEFAULT_TEST_PASSWORD,
    phone: overrides?.phone,
    education: overrides?.education ?? DEFAULT_TEST_EDUCATION,
  };

  const registerRes = await request(app).post('/api/v1/auth/register').send(payload);
  expectOk(registerRes, 201);

  const otp = await readLatestOtp(payload.email);
  const verifyRes = await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ email: payload.email, token: otp });
  expectOk(verifyRes, 200);

  return payload;
}

export async function login(
  app: Express,
  email: string,
  password: string,
  options?: { mobile?: boolean; platform?: 'ANDROID' | 'IOS' }
) {
  const req = request(app).post('/api/v1/auth/login').send({
    email,
    password,
    device: {
      platform: options?.mobile ? options.platform ?? 'ANDROID' : 'WEB',
      deviceName: 'Test Device',
      appVersion: '1.0.0',
    },
  });

  if (options?.mobile) {
    req.set('X-Client-Channel', 'mobile');
    req.set('X-Client-Platform', options.platform ?? 'ANDROID');
  }

  const res = await req;
  expectOk(res, 200);
  return res;
}

export async function createUserDirect(params: {
  email: string;
  password: string;
  role: typeof UserRole[keyof typeof UserRole];
  status?: typeof UserStatus[keyof typeof UserStatus];
  fullName?: string;
  emailVerified?: boolean;
}) {
  const user = await User.create({
    email: params.email.toLowerCase(),
    passwordHash: await hashPassword(params.password),
    role: params.role,
    status: params.status ?? UserStatus.ACTIVE,
    authProvider: AuthProvider.LOCAL,
    emailVerified: params.emailVerified ?? true,
    phoneVerified: false,
  });

  await UserProfile.create({
    userId: user._id,
    fullName: params.fullName ?? 'Admin User',
  });

  return user;
}

export async function readLatestOtp(email: string): Promise<string> {
  const redis = getRedis();
  const storedHash = await redis.get(RedisKeys.emailOtp(email));
  if (!storedHash) {
    throw new Error(`No OTP hash in Redis for ${email}`);
  }

  // Recover OTP from email outbox in test/dev (SMTP not configured).
  const mail = [...emailOutbox].reverse().find((m) => m.to === email.toLowerCase());
  if (!mail) {
    throw new Error(`No email outbox entry for ${email}`);
  }

  const match = mail.text.match(/\b(\d{6})\b/);
  if (!match) {
    throw new Error('OTP not found in email body');
  }

  const otp = match[1]!;
  if (hashToken(otp) !== storedHash) {
    throw new Error('OTP from email does not match Redis hash');
  }
  return otp;
}

export async function readLatestResetToken(email: string): Promise<string> {
  const mail = [...emailOutbox].reverse().find((m) => m.to === email.toLowerCase());
  if (!mail) {
    throw new Error(`No reset email for ${email}`);
  }
  const match = mail.text.match(/token=([A-Za-z0-9\-_]+)/);
  if (!match) {
    // Fallback: extract from reset URL query
    const urlMatch = mail.html.match(/token=([A-Za-z0-9\-_]+)/);
    if (!urlMatch) throw new Error('Reset token not found in email');
    return decodeURIComponent(urlMatch[1]!);
  }
  return decodeURIComponent(match[1]!);
}

export function expectOk(res: request.Response, status: number): void {
  if (res.status !== status) {
    throw new Error(
      `Expected status ${status}, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
  if (res.body?.success !== true) {
    throw new Error(`Expected success response: ${JSON.stringify(res.body)}`);
  }
}

export function expectFail(res: request.Response, status: number): void {
  if (res.status !== status) {
    throw new Error(
      `Expected status ${status}, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
  if (res.body?.success !== false) {
    throw new Error(`Expected error response: ${JSON.stringify(res.body)}`);
  }
}
