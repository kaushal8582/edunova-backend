import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { getEnv, isTest } from '../../config/env';
import { BOOK_PROCESS_JOB, BOOK_QUEUE_NAME } from '../../constants/ebook.constants';

let connection: IORedis | null = null;
let bookQueue: Queue | null = null;

export function getBullmqConnection(): ConnectionOptions {
  if (!connection) {
    const env = getEnv();
    connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  return connection as unknown as ConnectionOptions;
}

export function getBookProcessingQueue(): Queue {
  if (bookQueue) return bookQueue;
  bookQueue = new Queue(BOOK_QUEUE_NAME, {
    connection: getBullmqConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return bookQueue;
}

export interface ProcessBookVersionJobData {
  bookId: string;
  versionId: string;
  requestedBy?: string;
}

export async function enqueueBookVersionProcessing(
  data: ProcessBookVersionJobData,
  options?: JobsOptions
): Promise<string | null> {
  const env = getEnv();
  if (env.DISABLE_BOOK_QUEUE === true || isTest()) {
    return null;
  }

  const queue = getBookProcessingQueue();
  const jobId = `book-version-${data.versionId}`;
  const job = await queue.add(BOOK_PROCESS_JOB, data, {
    jobId,
    ...options,
  });
  return job.id ?? jobId;
}

export async function closeBookQueues(): Promise<void> {
  if (bookQueue) {
    await bookQueue.close();
    bookQueue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
