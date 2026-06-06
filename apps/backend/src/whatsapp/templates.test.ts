import { describe, it, expect } from 'vitest';
import { TEMPLATES, renderTemplate } from './templates';

describe('templates', () => {
  it('exposes every flow message', () => {
    const required = [
      'onboarding_welcome',
      'onboarding_account_ready',
      'onboarding_payment_link',
      'subscription_activated',
      'menu_returning',
      'renew_ask_days',
      'renew_quote',
      'renew_confirmed',
      'pause_confirm',
      'pause_done',
      'auto_resume_reminder',
      'resume_ask',
      'resume_done',
      'support_menu',
      'support_missed_ask_date',
      'support_credit_applied',
      'support_close',
      'delivery_confirmation',
      'broadcast_route_update',
    ];
    for (const name of required) {
      expect(TEMPLATES).toHaveProperty(name);
    }
  });

  it('marks every operational message as UTILITY (cheapest tier)', () => {
    for (const [, tpl] of Object.entries(TEMPLATES)) {
      expect(tpl.category).toBe('UTILITY');
    }
  });

  it('keeps template names stable — Meta approval is per-name', () => {
    // If you rename a template, you re-submit it for approval.
    // This is a deliberate snapshot to prevent accidental renames.
    expect(Object.keys(TEMPLATES).sort()).toMatchInlineSnapshot(`
      [
        "auto_resume_reminder",
        "broadcast_route_update",
        "delivery_confirmation",
        "menu_returning",
        "onboarding_account_ready",
        "onboarding_payment_link",
        "onboarding_welcome",
        "pause_confirm",
        "pause_done",
        "renew_ask_days",
        "renew_confirmed",
        "renew_quote",
        "resume_ask",
        "resume_done",
        "subscription_activated",
        "support_close",
        "support_credit_applied",
        "support_menu",
        "support_missed_ask_date",
      ]
    `);
  });
});

describe('renderTemplate', () => {
  it('substitutes named variables into numbered slots', () => {
    const rendered = renderTemplate('onboarding_payment_link', {
      litres: '1',
      days: '30',
      rate: '64',
      total: '1920',
    });
    expect(rendered).toBe(
      '1 litre × 30 days × ₹64 = ₹1920. Here is your secure payment link.',
    );
  });

  it('handles single-variable templates', () => {
    const rendered = renderTemplate('subscription_activated', {
      litres_per_day: '1',
    });
    expect(rendered).toContain('1 litre/day');
  });

  it('renders missing variables as their numbered placeholder (loud failure)', () => {
    // If a flow handler forgets a variable, we want it visible — not silently
    // substituted with empty string and shipped to a customer.
    const rendered = renderTemplate('onboarding_payment_link', {
      litres: '1',
      // days, rate, total intentionally missing
    });
    expect(rendered).toContain('{{2}}');
    expect(rendered).toContain('{{3}}');
    expect(rendered).toContain('{{4}}');
  });
});
