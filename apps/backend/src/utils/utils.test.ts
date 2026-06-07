import { describe, it, expect } from 'vitest';
import { normalizePhone, redactPhone } from './phone';
import { addDays, daysBetween, startOfDayUTC, isoDate } from './dates';

describe('normalizePhone', () => {
  it('adds +91 to a bare 10-digit number', () => {
    expect(normalizePhone('9999999999')).toBe('+919999999999');
  });

  it('handles already-prefixed 91XXXXXXXXXX', () => {
    expect(normalizePhone('919999999999')).toBe('+919999999999');
  });

  it('keeps existing + prefix', () => {
    expect(normalizePhone('+919999999999')).toBe('+919999999999');
  });

  it('strips spaces and dashes', () => {
    expect(normalizePhone('+91 99999-99999')).toBe('+919999999999');
  });
});

describe('redactPhone', () => {
  it('shows first 3 and last 2 only', () => {
    expect(redactPhone('+919999912345')).toBe('+91*****45');
  });

  it('returns **** for short input', () => {
    expect(redactPhone('123')).toBe('****');
  });
});

describe('date utils', () => {
  it('startOfDayUTC truncates to midnight', () => {
    const d = new Date('2026-06-02T15:30:45.123Z');
    expect(startOfDayUTC(d).toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('addDays moves forward and backward', () => {
    const d = new Date('2026-06-02T00:00:00.000Z');
    expect(addDays(d, 1).toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(addDays(d, -7).toISOString().slice(0, 10)).toBe('2026-05-26');
  });

  it('daysBetween is inclusive of the start-day clock', () => {
    expect(
      daysBetween(new Date('2026-06-01'), new Date('2026-06-03')),
    ).toBe(2);
  });

  it('isoDate returns YYYY-MM-DD', () => {
    expect(isoDate(new Date('2026-06-02T15:30:00.000Z'))).toBe('2026-06-02');
  });
});
