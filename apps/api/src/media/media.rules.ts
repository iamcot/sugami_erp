import type { MediaKind } from '@sugami/db';

const MB = 1024 * 1024;

/** Accepted upload types → kind, file extension and size limit. */
export const UPLOAD_TYPES: Record<string, { kind: MediaKind; ext: string; maxBytes: number }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg', maxBytes: 20 * MB },
  'image/png': { kind: 'image', ext: 'png', maxBytes: 20 * MB },
  'image/webp': { kind: 'image', ext: 'webp', maxBytes: 20 * MB },
  'image/gif': { kind: 'image', ext: 'gif', maxBytes: 20 * MB },
  'image/heic': { kind: 'image', ext: 'heic', maxBytes: 20 * MB },
  'video/mp4': { kind: 'video', ext: 'mp4', maxBytes: 500 * MB },
  'video/quicktime': { kind: 'video', ext: 'mov', maxBytes: 500 * MB },
  'video/webm': { kind: 'video', ext: 'webm', maxBytes: 500 * MB },
  'application/pdf': { kind: 'file', ext: 'pdf', maxBytes: 20 * MB },
};

/** Storage path for a new asset: media/<yyyy>/<mm>/<id>.<ext> (the storage adds its prefix). */
export function mediaPath(id: string, ext: string, now = new Date()): string {
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `media/${now.getUTCFullYear()}/${mm}/${id}.${ext}`;
}
