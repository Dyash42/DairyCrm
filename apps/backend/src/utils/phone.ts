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

/**
 * Scrub any phone-shaped substring from a free-text log line.
 *
 * Matches: +91 9876543210, +919876543210, 9876543210, +1 (212) 555-1234
 * Replaces each match with a redactPhone-style mask. Idempotent.
 *
 * Use when you log a free-text message that may contain a phone the
 * Pino path-redact (which only sees known JSON keys) won't catch — e.g.
 * `req.log.info(\`bot received: ${incomingMessage}\`)`.
 */
export function scrubPhones(text: string): string {
  if (!text) return text;
  // Catches: optional +, optional country code (1-3 digits), then 10+ digits
  // with optional spaces/dashes/parens. Min 10 digits total to avoid eating
  // order IDs or version numbers.
  // Match a phone-shaped run: starts with + or digit, contains
  // digits/space/dash/parens, ends in a digit. Then we re-count actual
  // digits in the replacement function to filter false positives (10-15
  // digits = phone; anything else = ID/order/whatever, returned as-is).
  return text.replace(/[+\d][\d\s\-()]{8,18}\d/g, (m) => {
    const digitsOnly = m.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 15) return m;
    return redactPhone(`+${digitsOnly}`);
  });
}
