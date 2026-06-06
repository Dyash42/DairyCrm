import { describe, it, expect } from 'vitest';
import { generateQrDataUrl, generateQrPng } from './qrcode';

describe('generateQrDataUrl', () => {
  it('returns a PNG data URL', async () => {
    const url = await generateQrDataUrl('JHR-100455');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    // Base64 payload should be non-trivial
    expect(url.length).toBeGreaterThan(500);
  });

  it('rejects empty payload', async () => {
    await expect(generateQrDataUrl('')).rejects.toThrow(TypeError);
  });

  it('produces deterministic output for same input', async () => {
    const a = await generateQrDataUrl('JHR-100455');
    const b = await generateQrDataUrl('JHR-100455');
    expect(a).toBe(b);
  });

  it('produces different output for different input', async () => {
    const a = await generateQrDataUrl('JHR-100455');
    const b = await generateQrDataUrl('JHR-100456');
    expect(a).not.toBe(b);
  });

  it('respects custom size option', async () => {
    const small = await generateQrDataUrl('JHR-100455', { size: 128 });
    const large = await generateQrDataUrl('JHR-100455', { size: 1024 });
    // Larger payload → larger data URL.
    expect(large.length).toBeGreaterThan(small.length);
  });
});

describe('generateQrPng', () => {
  it('returns a PNG Buffer with the correct magic number', async () => {
    const buf = await generateQrPng('JHR-100455');
    expect(Buffer.isBuffer(buf)).toBe(true);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });
});
