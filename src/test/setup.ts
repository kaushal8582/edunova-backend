import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { loadEnv } from '../config/env';
import { setRedisClient } from '../config/redis';
import { clearEmailOutbox } from '../services/email/email.service';
import { MemoryRedis } from './memory-redis';

let mongo: MongoMemoryReplSet;
const redis = new MemoryRedis();

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: {
      systemBinary: process.env.MONGOMS_SYSTEM_BINARY || '/opt/homebrew/bin/mongod',
      version: process.env.MONGOMS_VERSION || '7.0.16',
      downloadDir: `${process.cwd()}/.cache/mongodb-binaries`,
    },
  });

  const uri = mongo.getUri();

  loadEnv({
    NODE_ENV: 'test',
    MONGODB_URI: uri,
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    FRONTEND_URL: 'http://localhost:3000',
    ARGON2_MEMORY_COST: 4096,
    ARGON2_TIME_COST: 1,
    ARGON2_PARALLELISM: 1,
    EMAIL_VERIFICATION_OTP_TTL_SECONDS: 900,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: 1,
    PASSWORD_RESET_TTL_SECONDS: 3600,
    STORAGE_PROVIDER: 'local',
    DISABLE_BOOK_QUEUE: 'true',
    REQUIRE_CHAPTER_APPROVAL_TO_PUBLISH: 'false',
    OCR_PROVIDER: 'none',
  });

  setRedisClient(redis as unknown as import('ioredis').default);
  await mongoose.connect(uri);
}, 180_000);

beforeEach(async () => {
  clearEmailOutbox();
  await redis.flushall();
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
  }
  setRedisClient(null);
});

export function getTestRedis(): MemoryRedis {
  return redis;
}
