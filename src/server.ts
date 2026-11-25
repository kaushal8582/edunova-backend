import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { loadEnv } from './config/env';
import { connectRedis, disconnectRedis } from './config/redis';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.info(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[server] received ${signal}, shutting down`);
    server.close(async () => {
      await disconnectRedis();
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[server] failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
