/**
 * Business constants — the single place where domain numbers live.
 *
 * Why centralize: rate per litre, OTP length, session expiry, etc. used to
 * appear hardcoded in multiple flows / services. Now they're imported from
 * here; changing one value updates the whole app.
 *
 * Per-tenant overrides (different ratePerLitre for a sister brand, e.g.)
 * will eventually come from a `Settings` table in the DB and override these
 * defaults at runtime. Today these are the defaults / dev values.
 */

// ---------- Time ----------
export const ONE_SECOND_MS = 1_000;
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// ---------- Customer codes ----------
export const CUSTOMER_CODE_PREFIX = 'JHR';
/** First code issued on a fresh DB: starts after this value. */
export const CUSTOMER_CODE_INITIAL = 100454;

// ---------- Pricing (defaults; overridden by Settings table per tenant later) ----------
export const DEFAULT_RATE_PER_LITRE_INR = 64;
export const DEFAULT_SUBSCRIPTION_DAYS = 30;
/** Days before subscription end we send the renewal reminder. */
export const RENEWAL_REMINDER_DAYS_BEFORE = 3;

// ---------- Location / navigation ----------
/** How long a customer's "drop your home pin" link stays valid. */
export const LOCATION_TOKEN_TTL_DAYS = 7;

// ---------- WhatsApp / messaging ----------
/** PRD §8 — utility category rate per message outside the service window. */
export const UTILITY_MESSAGE_COST_INR = 0.115;
/** Default language for templates (Meta requires a code at send-time). */
export const DEFAULT_TEMPLATE_LANGUAGE = 'en';

// ---------- Sessions / OTP / auth ----------
export const SESSION_EXPIRY_MS = 24 * ONE_HOUR_MS;
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 5 * ONE_MINUTE_MS;

// ---------- Rate limiting (per-IP) ----------
export const RATE_LIMITS = {
  default: { max: 200, timeWindowMs: ONE_MINUTE_MS },
  auth: { max: 5, timeWindowMs: ONE_MINUTE_MS },
  authVerify: { max: 10, timeWindowMs: ONE_MINUTE_MS },
  webhook: { max: 200, timeWindowMs: ONE_MINUTE_MS },
};

// ---------- QR codes ----------
export const QR_DEFAULT_SIZE_PX = 512;
export const QR_DEFAULT_ERROR_CORRECTION: 'L' | 'M' | 'Q' | 'H' = 'M';
export const QR_DEFAULT_MARGIN = 2;
