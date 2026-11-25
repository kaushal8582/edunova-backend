import { createReadStream, createWriteStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash, randomBytes } from 'node:crypto';
import { getEnv } from '../../config/env';
import type { ObjectStorage, PutObjectInput, SignedUrlResult, StorageObjectMeta } from './storage.interface';

/**
 * Filesystem-backed storage for local development and tests.
 * Signed "URLs" are opaque tokens mapped to keys in memory/disk metadata.
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly providerName = 'local';
  private readonly root: string;
  private readonly tokens = new Map<string, { key: string; expiresAt: number; mode: 'upload' | 'download' }>();

  constructor(rootDir?: string) {
    this.root = rootDir ?? path.resolve(process.cwd(), '.storage');
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  private resolveKeyPath(key: string): string {
    const normalized = key.replace(/^\/+/, '').replace(/\.\./g, '');
    const full = path.resolve(this.root, normalized);
    if (!full.startsWith(this.root)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async createUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<SignedUrlResult> {
    const token = randomBytes(24).toString('base64url');
    this.tokens.set(token, {
      key: params.key,
      expiresAt: Date.now() + params.expiresInSeconds * 1000,
      mode: 'upload',
    });
    const env = getEnv();
    return {
      url: `${env.FRONTEND_URL.replace(/\/$/, '')}/__local_storage/upload/${token}`,
      key: params.key,
      expiresInSeconds: params.expiresInSeconds,
      headers: { 'Content-Type': params.contentType },
    };
  }

  async createDownloadUrl(params: {
    key: string;
    expiresInSeconds: number;
    filename?: string;
  }): Promise<SignedUrlResult> {
    const token = randomBytes(24).toString('base64url');
    this.tokens.set(token, {
      key: params.key,
      expiresAt: Date.now() + params.expiresInSeconds * 1000,
      mode: 'download',
    });
    const env = getEnv();
    const q = params.filename ? `?filename=${encodeURIComponent(params.filename)}` : '';
    return {
      url: `${env.FRONTEND_URL.replace(/\/$/, '')}/__local_storage/download/${token}${q}`,
      key: params.key,
      expiresInSeconds: params.expiresInSeconds,
    };
  }

  /** Test/dev helper: resolve a local signed token. */
  resolveToken(token: string): { key: string; mode: 'upload' | 'download' } | null {
    const entry = this.tokens.get(token);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return { key: entry.key, mode: entry.mode };
  }

  async headObject(key: string): Promise<StorageObjectMeta | null> {
    const full = this.resolveKeyPath(key);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) return null;
      return {
        key,
        sizeBytes: stat.size,
        lastModified: stat.mtime,
      };
    } catch {
      return null;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const full = this.resolveKeyPath(key);
    return fs.readFile(full);
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectMeta> {
    const full = this.resolveKeyPath(input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    await fs.writeFile(full, body);
    return {
      key: input.key,
      sizeBytes: body.length,
      contentType: input.contentType,
      etag: createHash('md5').update(body).digest('hex'),
      lastModified: new Date(),
    };
  }

  async deleteObject(key: string): Promise<void> {
    const full = this.resolveKeyPath(key);
    try {
      await fs.unlink(full);
    } catch {
      // ignore missing
    }
  }

  async writeStreamFromPath(key: string, sourcePath: string): Promise<StorageObjectMeta> {
    const full = this.resolveKeyPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await pipeline(createReadStream(sourcePath), createWriteStream(full));
    return (await this.headObject(key))!;
  }
}
