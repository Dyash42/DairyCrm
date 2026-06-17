/**
 * Environment configuration — zod-validated at startup.
 *
 * Why centralize: every module reads from one source of truth, so adding a
 * new env var means one schema edit + one .env.example update. Startup-time
 * validation surfaces missing vars as a clean error instead of an undefined
 * crash deep inside a handler.
 *
 * Optional vars (Meta, Razorpay, Redis, SMS) gate the corresponding real
 * code path. If they're absent the app still boots in "dev/stub" mode —
 * the goal is "drop creds, restart, production".
 */

import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-secret-change-me-min-16-chars-long';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * Number of proxy hops in front of the app (load balancer / CDN). Bounds
   * how much of the X-Forwarded-For chain we trust for `req.ip`, which the
   * rate limiter keys on. A client could otherwise spoof XFF to get a fresh
   * rate-limit bucket on every request and brute-force login/OTP. Set to the
   * real hop count in production (usually 1).
   */
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  // --- Database ---
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),

  // --- Auth ---
  JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /**
   * Static OTP pin accepted for executive login when no real SMS provider is
   * wired — lets the field team log in without SMS sends. Leave UNSET in
   * production once SMS is configured: a fixed pin is effectively a shared
   * credential. A loud warning is logged whenever it is set.
   */
  AUTH_STATIC_OTP: z.string().regex(/^\d{4,8}$/).optional(),

  // --- Public URL of this backend (for webhook-fetchable QR images) ---
  /**
   * Public base URL of THIS backend, e.g. https://api.jharanai.com. Used to
   * build publicly-fetchable QR image URLs that the WhatsApp Cloud API can
   * load — Meta rejects `data:` URIs, so the onboarding QR must be a hosted
   * HTTPS link. When unset, the bot falls back to the data URL (works on the
   * stub provider / dev, fails on real Meta sends).
   */
  PUBLIC_BASE_URL: z.string().url().optional(),

  // --- Redis ---
  REDIS_URL: z.string().optional(),

  // --- WhatsApp (Meta Cloud API) ---
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_WABA_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v20.0'),
  /**
   * When `META_APP_SECRET` is unset, signature verification can't run. In
   * production we hard-fail; in dev/staging set this to '1' to explicitly
   * accept unsigned bodies (NEVER do this with a real Meta app subscribed
   * to your endpoint — anyone can inject events).
   */
  ALLOW_UNSIGNED_WEBHOOK: z.enum(['0', '1']).default('0'),

  // --- Payments ---
  /** Explicit pick; otherwise auto-detected by which keys are set. */
  PAYMENT_PROVIDER: z.enum(['razorpay', 'cashfree', 'stub']).optional(),
  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Cashfree
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),

  // --- Messaging (WhatsApp / future BSPs) ---
  MESSAGING_PROVIDER: z.enum(['meta', 'stub']).optional(),

  // --- SMS (for executive OTP) ---
  SMS_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  // --- Storage ---
  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  /** Public base URL when STORAGE_PROVIDER=local. Used to surface QR URLs
   *  in admin without exposing local file paths. */
  LOCAL_STORAGE_PUBLIC_BASE: z.string().optional(),

  // --- Observability ---
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /**
   * Business timezone — every "today" boundary, "MON_TO_SAT", and
   * scheduling decision uses this. Default IST since the dairy operates
   * out of Berhampur, Odisha. Override per-environment if needed.
   */
  BUSINESS_TZ: z.string().default('Asia/Kolkata'),

  // --- Admin (CORS origin for the web admin) ---
  ADMIN_ORIGIN: z.string().default('http://localhost:3001'),
});

export type AppConfig = z.infer<typeof Schema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[config] env validation failed:', parsed.error.format());
    process.exit(1);
  }
  // Hard production guardrails — running prod with the dev JWT secret means
  // every JWT is forgeable. Booting without a DB means every request
  // crashes at the first query. Fail fast before traffic arrives.
  if (parsed.data.NODE_ENV === 'production') {
    const fatal: string[] = [];
    if (!parsed.data.DATABASE_URL) fatal.push('DATABASE_URL is required in production');
    if (parsed.data.JWT_SECRET === DEV_JWT_SECRET) {
      fatal.push('JWT_SECRET must be set to a non-default value in production');
    }
    if (parsed.data.ADMIN_ORIGIN === 'http://localhost:3001') {
      fatal.push('ADMIN_ORIGIN must be set to the real admin origin in production (CORS)');
    }
    if (fatal.length > 0) {
      // eslint-disable-next-line no-console
      console.error('[config] refusing to boot in production:', fatal);
      process.exit(1);
    }
  }

  // Non-fatal but loud production-hygiene warnings — surfaced at boot so a
  // misconfiguration is visible in logs rather than discovered in an incident.
  const warn = (m: string) => {
    // eslint-disable-next-line no-console
    console.warn('[config] WARNING:', m);
  };
  if (parsed.data.ALLOW_UNSIGNED_WEBHOOK === '1') {
    warn('ALLOW_UNSIGNED_WEBHOOK=1 — WhatsApp webhook signatures are NOT verified. Never enable with a live Meta subscription.');
  }
  if (parsed.data.AUTH_STATIC_OTP) {
    warn('AUTH_STATIC_OTP is set — a fixed OTP pin accepts executive logins. Unset it once a real SMS provider is configured.');
  }

  cached = parsed.data;
  return cached;
}

/** For tests — reset after mutating process.env. */
export function _resetConfigForTests(): void {
  cached = null;
}
