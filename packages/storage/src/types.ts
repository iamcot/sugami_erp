export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the client must send with the upload (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectInfo {
  size: number;
  contentType?: string;
}

export interface UploadOptions {
  contentType: string;
  sizeBytes: number;
  expiresInSec?: number;
}

/**
 * File storage. Keys are full object keys (prefix included, see `key()`), stored as-is in the DB.
 */
export interface Storage {
  readonly driver: 's3' | 'local';
  /** Build a full key under the configured prefix, e.g. key('media/a.jpg') → 'sugami/media/a.jpg'. */
  key(path: string): string;
  /** URL the browser PUTs the file to directly (S3 presigned URL, or the API's local upload route). */
  presignUpload(key: string, opts: UploadOptions): Promise<PresignedUpload>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  head(key: string): Promise<ObjectInfo | null>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** URL to view/download the object (public base URL, presigned GET, or the API's local file route). */
  url(key: string, opts?: { expiresInSec?: number }): Promise<string>;
}

export const DEFAULT_UPLOAD_EXPIRY_SEC = 15 * 60;
export const DEFAULT_URL_EXPIRY_SEC = 60 * 60;

export function joinKey(prefix: string, path: string): string {
  const p = prefix.replace(/^\/+/, '');
  const clean = path.replace(/^\/+/, '');
  if (!p) return clean;
  return p.endsWith('/') ? p + clean : `${p}/${clean}`;
}

/** Reject keys that could escape a directory or are malformed. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((s) => s === '..' || s === '.' || s === '')
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}
