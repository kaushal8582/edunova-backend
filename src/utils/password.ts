import argon2 from 'argon2';
import { getEnv } from '../config/env';
import { ApiError } from './ApiError';

export async function hashPassword(plain: string): Promise<string> {
  const env = getEnv();
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export async function assertPasswordMatch(hash: string | undefined, plain: string): Promise<void> {
  if (!hash) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  const ok = await verifyPassword(hash, plain);
  if (!ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }
}
