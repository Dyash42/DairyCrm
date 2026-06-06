/**
 * Razorpay payment-link generator — STUB.
 *
 * Production:
 *   const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
 *   const link = await rzp.paymentLink.create({
 *     amount: amount * 100,
 *     currency: 'INR',
 *     accept_partial: false,
 *     description: note,
 *     customer: { name, contact: phone, email },
 *     notify: { sms: false, email: false },
 *     reminder_enable: false,
 *     callback_url: `${BASE_URL}/payments/callback`,
 *     callback_method: 'get',
 *   });
 *   return { url: link.short_url, id: link.id };
 *
 * On Razorpay webhook → update Payment row → activate Subscription.
 */

export interface PaymentLinkInput {
  customerId: string;
  amount: number; // INR
  note: string;
}

export interface PaymentLink {
  id: string;
  url: string;
  amount: number;
}

export async function createRazorpayPaymentLink(
  input: PaymentLinkInput,
): Promise<PaymentLink> {
  const id = `plink_stub_${Date.now()}`;
  const url = `https://rzp.io/l/${id}`;
  return { id, url, amount: input.amount };
}
