/**
 * Boot-time production guardrails for resolved providers + infrastructure.
 *
 * Catches the "silently running on stubs in production" failure class
 * (audit PRO-01, INT-04/06/11): a missing or typo'd Meta / payment-gateway
 * credential makes the provider factories fall back to their Stub, the app
 * boots clean and serves traffic, and yet NO WhatsApp message is ever sent,
 * every payment webhook is rejected, and OTPs print to stdout — with zero
 * signal. We fail fast in production and warn loudly everywhere else.
 */
import { loadConfig } from './config';
import { getMessagingProvider } from './providers/messaging';
import { getPaymentProvider } from './providers/payment';
import { getSmsProvider } from './providers/sms';

interface BootLogger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export function assertBootProviders(log: BootLogger): void {
  const cfg = loadConfig();
  const messaging = getMessagingProvider().name;
  const payment = getPaymentProvider().name;
  const sms = getSmsProvider().name;
  log.warn(
    { messaging, payment, sms, redis: Boolean(cfg.REDIS_URL) },
    '[boot] resolved providers',
  );

  if (cfg.NODE_ENV !== 'production') return;

  const fatal: string[] = [];
  if (messaging === 'stub') {
    fatal.push(
      'MESSAGING resolved to STUB in production — set Meta creds (META_PHONE_NUMBER_ID + META_ACCESS_TOKEN) or MESSAGING_PROVIDER=meta. ' +
        'On stub, no WhatsApp message is sent and every inbound webhook is rejected.',
    );
  }
  if (payment === 'stub') {
    fatal.push(
      'PAYMENT resolved to STUB in production — set RAZORPAY_*/CASHFREE_* creds or PAYMENT_PROVIDER. ' +
        'On stub, payment links are dead (stub.invalid) and no payment can ever be confirmed.',
    );
  }
  if (fatal.length > 0) {
    log.error({ fatal }, '[boot] refusing to start in production on stub providers');
    process.exit(1);
  }

  // Non-fatal but loud: single-instance constraints + degraded SMS.
  if (!cfg.REDIS_URL) {
    log.warn(
      {},
      '[boot] WARNING: REDIS_URL unset in production — WhatsApp sessions, webhook idempotency, ' +
        'executive OTP, and the rate limiter are in-process. Run a SINGLE API instance only; ' +
        'multi-instance will break executive login and lose conversation state.',
    );
  }
  if (sms === 'console') {
    log.warn(
      {},
      '[boot] WARNING: SMS resolved to console in production — executive OTPs print to stdout, not SMS. ' +
        'Set SMS_PROVIDER + creds (or keep AUTH_STATIC_OTP for pin login).',
    );
  }
}
