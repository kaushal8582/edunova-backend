import { getEnv, isTest } from '../../config/env';
import { LocalObjectStorage } from './local.storage';
import { S3CompatibleStorage } from './s3.storage';
import type { ObjectStorage } from './storage.interface';

export type { ObjectStorage, SignedUrlResult, StorageObjectMeta } from './storage.interface';
export { LocalObjectStorage } from './local.storage';
export { S3CompatibleStorage } from './s3.storage';

let storageSingleton: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (storageSingleton) return storageSingleton;

  const env = getEnv();
  if (env.STORAGE_PROVIDER === 'local' || isTest() || !env.STORAGE_BUCKET) {
    storageSingleton = new LocalObjectStorage(env.LOCAL_STORAGE_DIR);
    return storageSingleton;
  }

  storageSingleton = new S3CompatibleStorage({
    providerName: env.STORAGE_PROVIDER,
  });
  return storageSingleton;
}

/** Test helper */
export function setObjectStorage(storage: ObjectStorage | null): void {
  storageSingleton = storage;
}

export function buildStorageKey(parts: {
  bookId: string;
  versionId: string;
  format: string;
  filename: string;
}): string {
  const safeName = parts.filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return `books/${parts.bookId}/versions/${parts.versionId}/${parts.format.toLowerCase()}/${Date.now()}-${safeName}`;
}

export function buildCoverStorageKey(bookId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  return `books/${bookId}/covers/${Date.now()}-${safeName}`;
}

export function buildChapterContentKey(params: {
  bookId: string;
  versionId: string;
  chapterId: string;
  format: string;
}): string {
  return `books/${params.bookId}/versions/${params.versionId}/chapters/${params.chapterId}/${params.format.toLowerCase()}.txt`;
}
