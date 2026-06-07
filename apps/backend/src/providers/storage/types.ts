export type StorageProviderName = 'local' | 's3' | 'r2';

export interface UploadResult {
  /** Public URL or data-URL by which the file can be fetched. */
  url: string;
  /** Storage-side key (S3 key, local relative path, etc.). */
  key: string;
}

export interface StorageProvider {
  readonly name: StorageProviderName;
  readonly isConfigured: boolean;
  /** Upload bytes under `key`, return a URL. `contentType` like 'image/png'. */
  upload(key: string, content: Buffer, contentType: string): Promise<UploadResult>;
  /** Build a URL for an existing key (no network). */
  publicUrl(key: string): string;
}
