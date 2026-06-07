/**
 * Payment-link generation — thin pass-through to the payment provider.
 *
 * Kept as a separate module so existing imports work; the real work lives
 * in src/providers/payment/.
 */

import { getPaymentProvider } from '../providers/payment';
import type { PaymentLink, PaymentLinkInput } from '../providers/payment';

export type { PaymentLink, PaymentLinkInput };

export async function createRazorpayPaymentLink(
  input: PaymentLinkInput,
): Promise<PaymentLink> {
  return getPaymentProvider().createPaymentLink(input);
}

/** Provider-agnostic alias — prefer this in new code. */
export const createPaymentLink = createRazorpayPaymentLink;
