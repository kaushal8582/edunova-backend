import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '../../config/env';
import type { ObjectStorage, PutObjectInput, SignedUrlResult, StorageObjectMeta } from './storage.interface';

export class S3CompatibleStorage implements ObjectStorage {
  readonly providerName: string;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options?: { providerName?: string }) {
    const env = getEnv();
    this.providerName = options?.providerName ?? env.STORAGE_PROVIDER;
    this.bucket = env.STORAGE_BUCKET!;

    this.client = new S3Client({
      region: env.STORAGE_REGION || 'auto',
      endpoint: env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: Boolean(env.STORAGE_FORCE_PATH_STYLE),
      credentials:
        env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.STORAGE_ACCESS_KEY_ID,
              secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async createUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<SignedUrlResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
    });
    return {
      url,
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
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentDisposition: params.filename
        ? `attachment; filename="${params.filename.replace(/"/g, '')}"`
        : undefined,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds,
    });
    return {
      url,
      key: params.key,
      expiresInSeconds: params.expiresInSeconds,
    };
  }

  async headObject(key: string): Promise<StorageObjectMeta | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        key,
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag?.replace(/"/g, ''),
        lastModified: result.LastModified,
      };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const stream = result.Body;
    if (!stream) {
      throw new Error(`Empty object body for key ${key}`);
    }
    const bytes = await stream.transformToByteArray();
    return Buffer.from(bytes);
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectMeta> {
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
      })
    );
    return {
      key: input.key,
      sizeBytes: body.length,
      contentType: input.contentType,
      etag: result.ETag?.replace(/"/g, ''),
      lastModified: new Date(),
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}
