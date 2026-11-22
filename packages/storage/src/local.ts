import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  assertSafeKey,
  DEFAULT_UPLOAD_EXPIRY_SEC,
  joinKey,
  type ObjectInfo,
  type PresignedUpload,
  type Storage,
  type UploadOptions,
} from './types.js';

export interface LocalStorageConfig {
  /** Directory holding the files. */
  dir: string;
  prefix: string;
  /** Secret for signing upload tokens (APP_ENCRYPTION_KEY). */
  signingSecret: string;
  /** API route that accepts PUT /<token> uploads, e.g. "/api/media/local-upload". */
  uploadBaseUrl: string;
  /** API route that serves GET /<key>, e.g. "/api/media/local-files". */
  fileBaseUrl: string;
}

export interface LocalUploadGrant {
  key: string;
  contentType: string;
  sizeBytes: number;
  /** Unix ms. */
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** Dev/offline storage on disk. Uploads go through the API with an HMAC-signed, expiring token. */
export class LocalStorage implements Storage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(private readonly cfg: LocalStorageConfig) {
    if (!cfg.signingSecret) throw new Error('Local storage needs a signing secret (APP_ENCRYPTION_KEY)');
    this.root = resolve(cfg.dir);
  }

  key(path: string): string {
    return joinKey(this.cfg.prefix, path);
  }

  private path(key: string): string {
    assertSafeKey(key);
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return p;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.cfg.signingSecret).update(payload).digest('base64url');
  }

  async presignUpload(key: string, opts: UploadOptions): Promise<PresignedUpload> {
    assertSafeKey(key);
    const exp = Date.now() + (opts.expiresInSec ?? DEFAULT_UPLOAD_EXPIRY_SEC) * 1000;
    const grant: LocalUploadGrant = { key, contentType: opts.contentType, sizeBytes: opts.sizeBytes, exp };
    const payload = b64(JSON.stringify(grant));
    return {
      url: `${this.cfg.uploadBaseUrl}/${payload}.${this.sign(payload)}`,
      method: 'PUT',
      headers: { 'Content-Type': opts.contentType },
      expiresAt: new Date(exp),
    };
  }

  /** Check an upload token from presignUpload(); null when forged, malformed or expired. */
  verifyUploadToken(token: string, now = Date.now()): LocalUploadGrant | null {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LocalUploadGrant;
      if (typeof grant.exp !== 'number' || grant.exp < now) return null;
      assertSafeKey(grant.key);
      return grant;
    } catch {
      return null;
    }
  }

  async put(key: string, body: Uint8Array, _contentType: string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const s = await stat(this.path(key));
      return s.isFile() ? { size: s.size } : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async url(key: string): Promise<string> {
    assertSafeKey(key);
    return `${this.cfg.fileBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}
