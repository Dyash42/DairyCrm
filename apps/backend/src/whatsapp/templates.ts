/**
 * WhatsApp template registry — the source of truth for every message
 * Jharanai's bot can send.
 *
 * Each template here corresponds to a record submitted to Meta for approval
 * in WhatsApp Manager → Message Templates. Variable placeholders use
 * `{{1}}`, `{{2}}`, ... numbered slots (Meta's convention).
 *
 * Categories — see https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/
 *   - UTILITY        — transactional (confirmations, alerts)
 *   - AUTHENTICATION — OTP only (we don't use this yet)
 *   - MARKETING      — promotional (we avoid these unless needed)
 *
 * IMPORTANT: When `category = UTILITY` and the message is sent INSIDE the
 * customer-initiated 24-hr service window, Meta charges ₹0. Outside that
 * window — e.g. our auto-resume reminder going out 3 days later — it costs
 * ~₹0.115. See docs/Jharanai_CRM_Solution_Steps_v2.docx §8 for the math.
 */

export type TemplateCategory = 'UTILITY' | 'AUTHENTICATION' | 'MARKETING';

export interface WhatsAppTemplate {
  name: string;
  category: TemplateCategory;
  language: string; // 'en' | 'hi' | 'or' (Odia)
  body: string; // human-readable preview (actual submission goes via Meta UI)
  variables: string[]; // slot names in order — for type-safety in code
}

/** All templates we'll submit to Meta. */
export const TEMPLATES = {
  // ---------- Onboarding ----------
  onboarding_welcome: {
    name: 'onboarding_welcome',
    category: 'UTILITY',
    language: 'en',
    body:
      'Namaste 🙏 Welcome to Jharanai — fresh farm milk, delivered to your door every morning.\n\n' +
      "Looks like you're new here. Let's set up your daily delivery — takes about 2 minutes.\n\n" +
      'First, what is your full name?',
    variables: [],
  },
  onboarding_account_ready: {
    name: 'onboarding_account_ready',
    category: 'UTILITY',
    language: 'en',
    body:
      'Done! Your Jharanai Customer ID is {{1}}. Keep your unique QR handy — your milkman scans it at delivery.',
    variables: ['customer_code'],
  },
  onboarding_payment_link: {
    name: 'onboarding_payment_link',
    category: 'UTILITY',
    language: 'en',
    body: '{{1}} litre × {{2}} days × ₹{{3}} = ₹{{4}}. Here is your secure payment link.',
    variables: ['litres', 'days', 'rate', 'total'],
  },
  subscription_activated: {
    name: 'subscription_activated',
    category: 'UTILITY',
    language: 'en',
    body:
      'Payment received ✅ Thank you!\n\n' +
      'Subscription active: {{1}} litre/day, starting tomorrow.\n' +
      "You'll get a WhatsApp every morning once your milk is delivered. Welcome to the Jharanai family! 🥛",
    variables: ['litres_per_day'],
  },

  // ---------- Returning customer menu ----------
  menu_returning: {
    name: 'menu_returning',
    category: 'UTILITY',
    language: 'en',
    body: 'Welcome back, {{1}}! 👋 What would you like to do today?',
    variables: ['name'],
  },

  // ---------- Renewal reminder (sent N days before subscription expiry) ----------
  renewal_reminder: {
    name: 'renewal_reminder',
    category: 'UTILITY',
    language: 'en',
    body:
      "Hi {{1}}, your milk subscription ends on {{2}}. Reply RENEW to continue without interruption — it takes 30 seconds.",
    variables: ['name', 'end_date'],
  },

  // ---------- Renew ----------
  renew_ask_days: {
    name: 'renew_ask_days',
    category: 'UTILITY',
    language: 'en',
    body:
      'Your current plan is {{1}} litre/day. Which days of the week should we deliver?',
    variables: ['litres_per_day'],
  },
  renew_quote: {
    name: 'renew_quote',
    category: 'UTILITY',
    language: 'en',
    body: '{{1}} for {{2}} days = {{3}} deliveries. {{3}} × {{4}} L × ₹{{5}} = ₹{{6}}.',
    variables: ['day_pattern', 'duration_days', 'delivery_count', 'litres_per_day', 'rate', 'total'],
  },
  renew_confirmed: {
    name: 'renew_confirmed',
    category: 'UTILITY',
    language: 'en',
    body:
      'Payment received ✅\nYour schedule is updated — next delivery tomorrow morning. Thank you, {{1}}!',
    variables: ['name'],
  },

  // ---------- Pause ----------
  pause_confirm: {
    name: 'pause_confirm',
    category: 'UTILITY',
    language: 'en',
    body: 'To confirm: deliveries paused {{1}} – {{2}} ({{3}} days). No milk, no charge for these days.',
    variables: ['start_date', 'end_date', 'days_count'],
  },
  pause_done: {
    name: 'pause_done',
    category: 'UTILITY',
    language: 'en',
    body:
      'Done ✅ Your deliveries are paused {{1}}–{{2}} and will auto-resume on {{3}}. We will remind you the day before.',
    variables: ['start_date', 'end_date', 'resume_date'],
  },
  auto_resume_reminder: {
    name: 'auto_resume_reminder',
    category: 'UTILITY',
    language: 'en',
    body:
      'Hi {{1}} 🥛 Just a reminder — your milk deliveries resume tomorrow. {{2}} L will be at your door in the morning.',
    variables: ['name', 'litres_per_day'],
  },

  // ---------- Resume ----------
  resume_ask: {
    name: 'resume_ask',
    category: 'UTILITY',
    language: 'en',
    body: 'Your subscription is currently paused until {{1}}. Would you like to resume earlier?',
    variables: ['end_date'],
  },
  resume_done: {
    name: 'resume_done',
    category: 'UTILITY',
    language: 'en',
    body:
      'Welcome back! 🥛 Deliveries resume tomorrow, {{1}} — {{2}} litre/day. See you in the morning!',
    variables: ['date', 'litres_per_day'],
  },

  // ---------- Support ----------
  support_menu: {
    name: 'support_menu',
    category: 'UTILITY',
    language: 'en',
    body: 'How can we help you today?',
    variables: [],
  },
  support_missed_ask_date: {
    name: 'support_missed_ask_date',
    category: 'UTILITY',
    language: 'en',
    body: 'Sorry to hear that! Which day was the delivery missed?',
    variables: [],
  },
  support_credit_applied: {
    name: 'support_credit_applied',
    category: 'UTILITY',
    language: 'en',
    body:
      "Thanks for flagging. I've added a ₹{{1}} credit to your account for {{2}} — it will adjust your next bill automatically. Is there anything else I can help with?",
    variables: ['credit_amount', 'date'],
  },
  support_close: {
    name: 'support_close',
    category: 'UTILITY',
    language: 'en',
    body: 'Happy to help. Have a wonderful day, {{1}}!',
    variables: ['name'],
  },

  // ---------- Daily delivery confirmation (business-initiated, ₹0.115) ----------
  delivery_confirmation: {
    name: 'delivery_confirmation',
    category: 'UTILITY',
    language: 'en',
    body:
      '🥛 Delivered today: {{1}} L to {{2}}. Have a wonderful day! — Jharanai',
    variables: ['litres', 'address_short'],
  },

  // ---------- Broadcast (route-level update) ----------
  broadcast_route_update: {
    name: 'broadcast_route_update',
    category: 'UTILITY',
    language: 'en',
    body: '{{1}}\n\n— Jharanai',
    variables: ['message_body'],
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type TemplateName = keyof typeof TEMPLATES;

/** Render a template's body locally (preview/dev only — production uses Meta's variable system). */
export function renderTemplate(
  name: TemplateName,
  vars: Record<string, string>,
): string {
  const tpl = TEMPLATES[name];
  let body = tpl.body;
  tpl.variables.forEach((slot, i) => {
    const value = vars[slot] ?? `{{${i + 1}}}`;
    body = body.replaceAll(`{{${i + 1}}}`, value);
  });
  return body;
}
