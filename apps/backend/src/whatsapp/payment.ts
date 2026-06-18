/**
 * Payment-link generation — thin pass-through to the payment provider.
 *
 * Kept as a separate module so existing imports work; the real work lives
 * in src/providers/payment/.
 */

import { getPaymentProvider } from '../providers/payment';
import type { PaymentLink, PaymentLinkInput } from '../providers/payment';

export type { PaymentLink, PaymentLinkInput };

/**
 * INT-12: provider-agnostic. Delegates to whichever provider PAYMENT_PROVIDER
 * resolves to (Razorpay / Cashfree / stub) via getPaymentProvider(). The old
 * `createRazorpayPaymentLink` name was a trap — it implied a hard Razorpay lock
 * that does not exist and invited a future dev to import the Razorpay class
 * directly, which would break Cashfree. Named for what it does, not a provider.
 */
export async function createPaymentLink(
  input: PaymentLinkInput,
): Promise<PaymentLink> {
  return getPaymentProvider().createPaymentLink(input);
}
