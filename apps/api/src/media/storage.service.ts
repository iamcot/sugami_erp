import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createStorageFromEnv, type Storage } from '@sugami/storage';

export const LOCAL_UPLOAD_ROUTE = '/api/media/local-upload';
export const LOCAL_FILES_ROUTE = '/api/media/local-files';

/**
 * The configured file storage (S3 in production, local disk in dev). Built on first use so a
 * missing storage config only breaks media routes, not the whole API.
 */
@Injectable()
export class StorageService {
  private instance?: Storage;

  get storage(): Storage {
    if (!this.instance) {
      try {
        this.instance = createStorageFromEnv(process.env, {
          localUploadBaseUrl: LOCAL_UPLOAD_ROUTE,
          localFileBaseUrl: LOCAL_FILES_ROUTE,
        });
      } catch (err) {
        throw new ServiceUnavailableException(`Chưa cấu hình lưu trữ file: ${(err as Error).message}`);
      }
    }
    return this.instance;
  }
}
