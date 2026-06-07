/**
 * Local-disk storage — dev only.
 *
 * Writes to ./uploads/ relative to cwd and serves via a base URL (you'd
 * typically mount that path on Fastify's static plugin).
 * Falls back to returning a data URL when content is small (< 256 KB) so
 * the bot/admin don't need a static server in dev.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { StorageProvider, UploadResult } from './types';

const ROOT = path.resolve(process.cwd(), 'uploads');
const PUBLIC_BASE = process.env.LOCAL_STORAGE_PUBLIC_BASE ?? '/uploads';
const INLINE_THRESHOLD = 256 * 1024; // 256 KB

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;
  readonly isConfigured = true;

  async upload(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    if (content.byteLength < INLINE_THRESHOLD) {
      const dataUrl = `data:${contentType};base64,${content.toString('base64')}`;
      return { url: dataUrl, key };
    }
    const target = path.join(ROOT, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    return { url: this.publicUrl(key), key };
  }

  publicUrl(key: string): string {
    return `${PUBLIC_BASE.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
  }
}
