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

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // --- Database ---
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),

  // --- Auth ---
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-min-16-chars-long'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // --- Redis ---
  REDIS_URL: z.string().optional(),

  // --- WhatsApp (Meta Cloud API) ---
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_WABA_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v20.0'),

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

  // --- Observability ---
  SENTRY_DSN: z.string().optional(),

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
  cached = parsed.data;
  return cached;
}

/** For tests — reset after mutating process.env. */
export function _resetConfigForTests(): void {
  cached = null;
}
