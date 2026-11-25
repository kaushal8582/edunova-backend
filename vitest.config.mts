import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/edunova-test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
      FRONTEND_URL: 'http://localhost:3000',
      ARGON2_MEMORY_COST: '1024',
      ARGON2_TIME_COST: '1',
      ARGON2_PARALLELISM: '1',
      STORAGE_PROVIDER: 'local',
      DISABLE_BOOK_QUEUE: 'true',
      REQUIRE_CHAPTER_APPROVAL_TO_PUBLISH: 'false',
      OCR_PROVIDER: 'none',
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
