/**
 * Payment provider contract.
 *
 * Anything that creates a hosted payment link + verifies its webhook is a
 * `PaymentProvider`. Razorpay and Cashfree are concrete implementations.
 *
 * Swap rule:
 *   - To switch from Razorpay to Cashfree, set PAYMENT_PROVIDER=cashfree
 *     in .env and supply CASHFREE_* env vars. No code changes.
 *   - To add a new provider, create providers/payment/<name>.ts that
 *     exports `<Name>PaymentProvider` implementing this interface, then
 *     register it in providers/payment/index.ts. One edit.
 *
 * The wider app calls `getPaymentProvider()` — never imports a specific
 * provider directly.
 */

export interface PaymentLinkInput {
  /** Internal customer reference — opaque to the provider. */
  customerId: string;
  /** Amount in WHOLE RUPEES (₹). Providers convert to paise themselves. */
  amount: number;
  note: string;
  customer?: { name?: string; phone?: string; email?: string };
  /** Internal reference returned later in webhooks for reconciliation. */
  referenceId?: string;
}

export interface PaymentLink {
  /** Provider-side link id (e.g. `plink_xxx` for Razorpay, `cf_xxx` for Cashfree). */
  id: string;
  /** Short URL the customer clicks. */
  url: string;
  amount: number;
  /** Which provider issued this link. */
  provider: PaymentProviderName;
}

export type PaymentProviderName = 'razorpay' | 'cashfree' | 'stub';

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** True iff env credentials are present so we can issue real links. */
  readonly isConfigured: boolean;
  /** Create a hosted payment link the bot can send to the customer. */
  createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink>;
  /**
   * Verify a webhook callback's signature. `rawBody` MUST be the bytes
   * actually received over the wire (the provider signs the literal body,
   * not its JSON-roundtrip). Return true on match.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
