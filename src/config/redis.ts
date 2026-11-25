import Redis from 'ioredis';
import { getEnv, isTest } from './env';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = getEnv().REDIS_URL;
  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    ...(isTest() ? { retryStrategy: () => null } : {}),
  });

  redisClient.on('error', (err) => {
    if (!isTest()) {
      // Avoid logging connection strings or secrets.
      console.error('[redis] connection error:', err.message);
    }
  });

  return redisClient;
}

export async function connectRedis(): Promise<Redis> {
  const client = getRedis();
  if (client.status === 'wait' || client.status === 'end') {
    await client.connect();
  }
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  } finally {
    redisClient = null;
  }
}

/** Test helper: inject a mock/stub Redis client. */
export function setRedisClient(client: Redis | null): void {
  redisClient = client;
}

export const RedisKeys = {
  emailOtp: (email: string) => `auth:email-otp:${email.toLowerCase()}`,
  emailOtpCooldown: (email: string) => `auth:email-otp-cooldown:${email.toLowerCase()}`,
  passwordResetCooldown: (email: string) => `auth:pwd-reset-cooldown:${email.toLowerCase()}`,
  loginRate: (key: string) => `auth:login-rate:${key}`,
} as const;
