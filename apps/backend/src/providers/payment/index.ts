/**
 * Payment provider factory.
 *
 * Resolution order:
 *   1. Explicit config: PAYMENT_PROVIDER env (`razorpay` | `cashfree` | `stub`)
 *   2. Auto-detect by which credentials are present
 *   3. Stub fallback (dev / CI)
 *
 * Anything else in the app calls `getPaymentProvider()` and never imports
 * a concrete implementation directly.
 */

import { loadConfig } from '../../config';
import { CashfreePaymentProvider } from './cashfree';
import { RazorpayPaymentProvider } from './razorpay';
import { StubPaymentProvider } from './stub';
import type { PaymentProvider, PaymentProviderName } from './types';

export * from './types';

let cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const config = loadConfig();
  const explicit = config.PAYMENT_PROVIDER as PaymentProviderName | undefined;

  if (explicit === 'razorpay') return (cached = new RazorpayPaymentProvider());
  if (explicit === 'cashfree') return (cached = new CashfreePaymentProvider());
  if (explicit === 'stub') return (cached = new StubPaymentProvider());

  // Auto-detect
  const rzp = new RazorpayPaymentProvider();
  if (rzp.isConfigured) return (cached = rzp);
  const cf = new CashfreePaymentProvider();
  if (cf.isConfigured) return (cached = cf);
  return (cached = new StubPaymentProvider());
}

/** For tests — reset the singleton after mutating env. */
export function _resetPaymentProviderForTests(): void {
  cached = null;
}
