/**
 * Phone-number normalization — single source of truth so DB lookups,
 * WhatsApp sends, and OTP verifications all agree on the canonical form.
 *
 * Canonical form: E.164 with leading '+', e.g. '+919999999999'.
 */

const DEFAULT_COUNTRY_CODE = '+91';

export function normalizePhone(input: string): string {
  if (!input) return input;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return input.startsWith('+') ? input : `+${digits}`;
}

/** Last 4 digits only — for log redaction (never log full phone at INFO). */
export function redactPhone(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  return `${phone.slice(0, 3)}*****${phone.slice(-2)}`;
}
