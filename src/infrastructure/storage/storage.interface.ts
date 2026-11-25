export interface StorageObjectMeta {
  key: string;
  sizeBytes: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface SignedUrlResult {
  url: string;
  key: string;
  expiresInSeconds: number;
  headers?: Record<string, string>;
}

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
}

/**
 * S3-compatible object storage abstraction.
 * Business logic must depend on this interface, never a concrete provider.
 */
export interface ObjectStorage {
  readonly providerName: string;

  createUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
    maxSizeBytes?: number;
  }): Promise<SignedUrlResult>;

  createDownloadUrl(params: {
    key: string;
    expiresInSeconds: number;
    filename?: string;
  }): Promise<SignedUrlResult>;

  headObject(key: string): Promise<StorageObjectMeta | null>;

  getObjectBuffer(key: string): Promise<Buffer>;

  putObject(input: PutObjectInput): Promise<StorageObjectMeta>;

  deleteObject(key: string): Promise<void>;
}
