import { describe, it, expect } from 'vitest';
import { formatCustomerCode, parseCustomerCode } from './customer-code';

describe('formatCustomerCode', () => {
  it('pads to 6 digits with JHR- prefix', () => {
    expect(formatCustomerCode(1)).toBe('JHR-000001');
    expect(formatCustomerCode(100455)).toBe('JHR-100455');
    expect(formatCustomerCode(999999)).toBe('JHR-999999');
  });

  it('does not truncate beyond 6 digits — future-proof if we cross 1M customers', () => {
    expect(formatCustomerCode(1_000_000)).toBe('JHR-1000000');
  });

  it('rejects zero and negative values', () => {
    expect(() => formatCustomerCode(0)).toThrow(RangeError);
    expect(() => formatCustomerCode(-1)).toThrow(RangeError);
  });

  it('rejects non-integers', () => {
    expect(() => formatCustomerCode(1.5)).toThrow(RangeError);
  });

  it('supports custom prefix (future invoices etc.)', () => {
    expect(formatCustomerCode(42, 'JHR')).toBe('JHR-000042');
  });
});

describe('parseCustomerCode', () => {
  it('parses well-formed codes', () => {
    expect(parseCustomerCode('JHR-100455')).toEqual({ prefix: 'JHR', value: 100455 });
    expect(parseCustomerCode('JHR-000001')).toEqual({ prefix: 'JHR', value: 1 });
  });

  it('trims whitespace (QR scanner output sometimes has trailing newlines)', () => {
    expect(parseCustomerCode('  JHR-100455\n')).toEqual({ prefix: 'JHR', value: 100455 });
  });

  it('rejects malformed input rather than throwing — caller checks for null', () => {
    expect(parseCustomerCode('JHR100455')).toBeNull();
    expect(parseCustomerCode('JHR-')).toBeNull();
    expect(parseCustomerCode('jhr-100455')).toBeNull(); // case-sensitive
    expect(parseCustomerCode('XXX-100455')).toEqual({ prefix: 'XXX', value: 100455 });
    expect(parseCustomerCode('')).toBeNull();
  });

  it('round-trips with formatCustomerCode', () => {
    const cases = [1, 42, 100455, 999999];
    for (const n of cases) {
      const code = formatCustomerCode(n);
      const parsed = parseCustomerCode(code);
      expect(parsed).toEqual({ prefix: 'JHR', value: n });
    }
  });
});
