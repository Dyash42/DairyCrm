/**
 * QR code image generator.
 *
 * PRD §2 onboarding: "System auto-generates a Unique QR Code linked to
 * Customer ID" and "sends QR code image". The encoded payload is the
 * customer code (`JHR-XXXXXX`) so the milkman's scanner can resolve it
 * directly without an extra DB lookup against an opaque ID.
 *
 * We expose two shapes:
 *   - dataUrl     — `data:image/png;base64,...` — embed inline in admin UI
 *                   or pass to WhatsApp Cloud API media-by-link.
 *   - pngBuffer   — raw PNG bytes — upload to S3/R2 to get a hosted URL.
 *
 * Both go through the same QRCode toBuffer/toDataURL path so the encoded
 * data is byte-identical.
 */

import QRCode from 'qrcode';

import {
  QR_DEFAULT_ERROR_CORRECTION,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_SIZE_PX,
} from '../constants';

export interface QrOptions {
  /** Output square pixel size. Defaults to 512 — readable from a meter away. */
  size?: number;
  /**
   * Error-correction level. We default to 'M' (15% redundancy) which survives
   * being printed on paper, taped, and partially scuffed. 'H' is overkill at
   * our QR sizes; 'L' is risky if the sticker gets a smudge.
   */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Quiet zone (border) in modules. Default 2 keeps it tight; min for spec is 4 but 2 scans fine in practice. */
  margin?: number;
}

const DEFAULTS: Required<QrOptions> = {
  size: QR_DEFAULT_SIZE_PX,
  errorCorrectionLevel: QR_DEFAULT_ERROR_CORRECTION,
  margin: QR_DEFAULT_MARGIN,
};

/**
 * Build a versioned QR payload — encodes both the customer code AND the
 * current QR version number so by-code lookup can detect an old QR
 * being scanned after regeneration.
 *
 * Format: `JHR-100455:v3` — version starts at 1 on initial QR creation
 * and increments on every regenerate. The scanner endpoint refuses to
 * match if the embedded version is older than the currently-active row.
 */
export function buildVersionedQrPayload(customerCode: string, version: number): string {
  return `${customerCode}:v${version}`;
}

/**
 * Parse a scanned payload back into (code, version). Returns null if
 * the input doesn't look like a versioned payload — callers should fall
 * back to treating the whole string as a v1 customer code so legacy
 * (pre-versioning) QR stickers keep working.
 */
export function parseVersionedQrPayload(
  payload: string,
): { customerCode: string; version: number } | null {
  const m = /^([A-Z]+-\d+):v(\d+)$/.exec(payload.trim());
  if (!m || !m[1] || !m[2]) return null;
  const version = Number(m[2]);
  if (!Number.isInteger(version) || version < 1) return null;
  return { customerCode: m[1], version };
}

/**
 * Encode a customer code (or any short payload) as a PNG data URL.
 */
export async function generateQrDataUrl(
  payload: string,
  opts: QrOptions = {},
): Promise<string> {
  if (!payload || typeof payload !== 'string') {
    throw new TypeError('payload must be a non-empty string');
  }
  const o = { ...DEFAULTS, ...opts };
  return QRCode.toDataURL(payload, {
    width: o.size,
    errorCorrectionLevel: o.errorCorrectionLevel,
    margin: o.margin,
    type: 'image/png',
  });
}

/**
 * Encode as raw PNG bytes. Use this when uploading to S3/R2.
 */
export async function generateQrPng(
  payload: string,
  opts: QrOptions = {},
): Promise<Buffer> {
  if (!payload || typeof payload !== 'string') {
    throw new TypeError('payload must be a non-empty string');
  }
  const o = { ...DEFAULTS, ...opts };
  return QRCode.toBuffer(payload, {
    width: o.size,
    errorCorrectionLevel: o.errorCorrectionLevel,
    margin: o.margin,
    type: 'png',
  });
}
