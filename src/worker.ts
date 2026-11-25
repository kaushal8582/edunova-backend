import { Worker } from 'bullmq';
import { loadEnv } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { BOOK_PROCESS_JOB, BOOK_QUEUE_NAME } from './constants/ebook.constants';
import {
  closeBookQueues,
  getBullmqConnection,
  type ProcessBookVersionJobData,
} from './infrastructure/queues/bullmq';
import { processBookVersionJob } from './modules/ebooks/workers/book-processor';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDatabase();
  await connectRedis();

  const worker = new Worker<ProcessBookVersionJobData>(
    BOOK_QUEUE_NAME,
    async (job) => {
      if (job.name !== BOOK_PROCESS_JOB) {
        return;
      }
      await processBookVersionJob(job.data);
    },
    {
      connection: getBullmqConnection(),
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    console.info(`[worker] completed job ${job.id}`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker] failed job ${job?.id}:`, err.message);
  });

  console.info(`[worker] ebook processing worker started (${env.NODE_ENV})`);

  const shutdown = async (signal: string) => {
    console.info(`[worker] received ${signal}, shutting down`);
    await worker.close();
    await closeBookQueues();
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[worker] failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
