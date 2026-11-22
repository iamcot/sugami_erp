import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertSafeKey,
  DEFAULT_UPLOAD_EXPIRY_SEC,
  DEFAULT_URL_EXPIRY_SEC,
  joinKey,
  type ObjectInfo,
  type PresignedUpload,
  type Storage,
  type UploadOptions,
} from './types.js';

export interface S3StorageConfig {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Only for S3-compatible providers (R2, MinIO). Empty for AWS. */
  endpoint?: string;
  /** CloudFront/bucket base URL for public links; empty → presigned GET URLs. */
  publicBaseUrl?: string;
  prefix: string;
}

/**
 * Bucket names with dots (e.g. "sugami.vn") break TLS on virtual-hosted URLs
 * (bucket.s3.amazonaws.com wildcard certs cover one label), so use path-style for them.
 */
export function needsPathStyle(bucket: string, endpoint?: string): boolean {
  return Boolean(endpoint) || bucket.includes('.');
}

const isNotFound = (err: unknown) => {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
};

export class S3Storage implements Storage {
  readonly driver = 's3' as const;
  readonly client: S3Client;

  constructor(private readonly cfg: S3StorageConfig) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: needsPathStyle(cfg.bucket, cfg.endpoint),
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined,
    });
  }

  key(path: string): string {
    return joinKey(this.cfg.prefix, path);
  }

  async presignUpload(key: string, opts: UploadOptions): Promise<PresignedUpload> {
    assertSafeKey(key);
    const expiresIn = opts.expiresInSec ?? DEFAULT_UPLOAD_EXPIRY_SEC;
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.sizeBytes,
    });
    const url = await getSignedUrl(this.client, cmd, {
      expiresIn,
      // Sign these so the upload must match what the API approved.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': opts.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertSafeKey(key);
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async read(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  async url(key: string, opts?: { expiresInSec?: number }): Promise<string> {
    assertSafeKey(key);
    if (this.cfg.publicBaseUrl) {
      return `${this.cfg.publicBaseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    }
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }), {
      expiresIn: opts?.expiresInSec ?? DEFAULT_URL_EXPIRY_SEC,
    });
  }
}
