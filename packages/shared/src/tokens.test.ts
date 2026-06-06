import { describe, it, expect } from 'vitest';
import { formatINR, formatLitres, CURRENCY, CURRENCY_LOCALE } from './tokens';

describe('formatINR', () => {
  it('formats whole rupees with ₹ prefix and no decimals', () => {
    expect(formatINR(1920)).toBe('₹1,920');
  });

  it('uses Indian digit grouping (lakhs)', () => {
    expect(formatINR(100000)).toBe('₹1,00,000');
    expect(formatINR(1000000)).toBe('₹10,00,000');
  });

  it('handles zero', () => {
    expect(formatINR(0)).toBe('₹0');
  });

  it('handles negative balances (customer owes us)', () => {
    expect(formatINR(-128)).toBe('-₹128');
  });

  it('rounds fractions away (we never charge paise via WhatsApp link)', () => {
    expect(formatINR(1920.4)).toBe('₹1,920');
    expect(formatINR(1920.6)).toBe('₹1,921');
  });

  it('exports stable currency constants', () => {
    expect(CURRENCY).toBe('INR');
    expect(CURRENCY_LOCALE).toBe('en-IN');
  });
});

describe('formatLitres', () => {
  it('drops decimals for whole numbers', () => {
    expect(formatLitres(2)).toBe('2 L');
    expect(formatLitres(10)).toBe('10 L');
  });

  it('keeps one decimal for partial litres (1.5 L is a common subscription)', () => {
    expect(formatLitres(1.5)).toBe('1.5 L');
    expect(formatLitres(0.5)).toBe('0.5 L');
  });

  it('handles zero', () => {
    expect(formatLitres(0)).toBe('0 L');
  });
});
