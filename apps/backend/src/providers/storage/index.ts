import { loadConfig } from '../../config';
import { LocalStorageProvider } from './local';
import { S3StorageProvider } from './s3';
import type { StorageProvider } from './types';

export * from './types';

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const c = loadConfig();
  if (c.STORAGE_PROVIDER === 's3' || c.STORAGE_PROVIDER === 'r2') {
    const p = new S3StorageProvider(c.STORAGE_PROVIDER);
    if (p.isConfigured) return (cached = p);
  }
  return (cached = new LocalStorageProvider());
}

export function _resetStorageProviderForTests(): void {
  cached = null;
}
