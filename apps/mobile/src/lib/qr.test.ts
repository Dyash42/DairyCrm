import { normalizeScannedCode } from './qr';

describe('normalizeScannedCode', () => {
  test('passes through a plain code, uppercased + trimmed', () => {
    expect(normalizeScannedCode('  jhr-100455 ')).toBe('JHR-100455');
  });

  test('strips a lowercase version suffix', () => {
    expect(normalizeScannedCode('JHR-100455:v3')).toBe('JHR-100455');
  });

  test('strips an uppercase version suffix (regression: reprinted stickers)', () => {
    expect(normalizeScannedCode('JHR-100455:V12')).toBe('JHR-100455');
  });

  test('a versioned and a plain sticker normalise to the same code', () => {
    expect(normalizeScannedCode('jhr-100390:v2')).toBe(normalizeScannedCode('JHR-100390'));
  });
});
