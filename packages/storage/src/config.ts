import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';
import type { Storage } from './types.js';

export interface StorageEnvOptions {
  /** API routes used by the local driver. */
  localUploadBaseUrl?: string;
  localFileBaseUrl?: string;
}

/** Build the storage from STORAGE_DRIVER / S3_* / STORAGE_DIR (see .env.example). */
export function createStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: StorageEnvOptions = {},
): Storage {
  const driver = (env.STORAGE_DRIVER || 's3').trim();
  const prefix = env.S3_PREFIX ?? 'sugami/';
  if (driver === 'local') {
    return new LocalStorage({
      dir: env.STORAGE_DIR || './data/storage',
      prefix,
      signingSecret: env.APP_ENCRYPTION_KEY ?? '',
      uploadBaseUrl: opts.localUploadBaseUrl ?? '/api/media/local-upload',
      fileBaseUrl: opts.localFileBaseUrl ?? '/api/media/local-files',
    });
  }
  if (driver !== 's3') throw new Error(`STORAGE_DRIVER must be "s3" or "local", got "${driver}"`);
  const missing = ['S3_REGION', 'S3_BUCKET'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(', ')} for STORAGE_DRIVER=s3`);
  return new S3Storage({
    region: env.S3_REGION!,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY || undefined,
    secretAccessKey: env.S3_SECRET_KEY || undefined,
    endpoint: env.S3_ENDPOINT || undefined,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL || undefined,
    prefix,
  });
}
