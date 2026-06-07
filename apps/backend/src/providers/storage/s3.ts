/**
 * S3 / Cloudflare R2 storage provider — skeleton.
 *
 * Why no `@aws-sdk/client-s3` import yet: keeps deps minimal until you
 * actually deploy. The real upload is a simple PUT with SigV4 — either
 * use the AWS SDK or the lightweight `aws4fetch` (~1 KB) once the bucket
 * is created.
 *
 * Both R2 and S3 share the same wire format; the only difference is
 * `S3_ENDPOINT` (R2 uses an account-scoped URL, S3 is regional).
 */

import { loadConfig } from '../../config';
import type { StorageProvider, UploadResult } from './types';

export class S3StorageProvider implements StorageProvider {
  readonly name: 's3' | 'r2';

  constructor(flavor: 's3' | 'r2' = 's3') {
    this.name = flavor;
  }

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.S3_BUCKET && c.S3_ACCESS_KEY && c.S3_SECRET_KEY);
  }

  async upload(_key: string, _content: Buffer, _contentType: string): Promise<UploadResult> {
    // Real impl: await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }))
    // then return { url: this.publicUrl(key), key }.
    throw new Error('S3 upload not implemented — install @aws-sdk/client-s3 and wire it here.');
  }

  publicUrl(key: string): string {
    const c = loadConfig();
    const base = c.S3_ENDPOINT?.replace(/\/$/, '');
    if (!base || !c.S3_BUCKET) return key;
    return `${base}/${c.S3_BUCKET}/${key.replace(/^\//, '')}`;
  }
}
