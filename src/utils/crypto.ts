import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Cryptographically secure 6-digit OTP (000000–999999). */
export function generateNumericOtp(digits = 6): string {
  const max = 10 ** digits;
  const value = randomInt(0, max);
  return value.toString().padStart(digits, '0');
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function hashToken(token: string): string {
  return sha256(token);
}
