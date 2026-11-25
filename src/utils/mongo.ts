import mongoose from 'mongoose';

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export function getDuplicateKeyFields(error: unknown): string[] {
  if (!isDuplicateKeyError(error)) return [];
  const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  if (!keyPattern) return [];
  return Object.keys(keyPattern);
}

export function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Runs `fn` inside a transaction when the deployment supports it.
 * Falls back to non-transactional execution on standalone MongoDB
 * (useful for local/dev without a replica set).
 */
export async function withOptionalTransaction<T>(
  fn: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  // Tests and simple standalone deployments may not support transactions.
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_MONGO_TRANSACTIONS === 'true') {
    return fn(null);
  }

  try {
    return await withTransaction((session) => fn(session));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Transaction numbers are only allowed') ||
      message.includes('replica set') ||
      message.includes('not support') ||
      message.includes('retryable writes')
    ) {
      return fn(null);
    }
    throw error;
  }
}
