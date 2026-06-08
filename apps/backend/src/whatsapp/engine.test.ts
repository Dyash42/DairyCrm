import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationEngine, _resetIdempotencyForTests } from './engine';
import { InMemorySessionStore, sessionStore } from './session-store';
import { WhatsAppSender } from './sender';
import type { BotRepos, InboundMessage, OutboundAction } from './types';

let testMessageIdCounter = 0;
function uniqueMessageId(): string {
  testMessageIdCounter += 1;
  return `m-test-${testMessageIdCounter}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * These tests treat the engine as a black box: feed inbound messages,
 * assert on (a) the persisted state and (b) the outbox.
 *
 * Safety-critical because the engine routes EVERY customer message — any
 * routing bug spams thousands of people or quietly drops support requests.
 */

function makeText(from: string, text: string): InboundMessage {
  return { kind: 'text', from, text, messageId: uniqueMessageId(), timestamp: Date.now() };
}

function makeButton(from: string, payload: string, title = payload): InboundMessage {
  return { kind: 'button', from, payload, title, messageId: uniqueMessageId(), timestamp: Date.now() };
}

function makeList(from: string, rowId: string, title = rowId): InboundMessage {
  return { kind: 'list', from, rowId, title, messageId: uniqueMessageId(), timestamp: Date.now() };
}

/** A sender that captures all actions instead of POSTing to Meta. */
class CapturingSender extends WhatsAppSender {
  public outbox: OutboundAction[] = [];

  override async send(action: OutboundAction) {
    this.outbox.push(action);
    return { messageId: `captured-${this.outbox.length}` };
  }

  override async sendBatch(actions: OutboundAction[]) {
    for (const a of actions) await this.send(a);
    return { sent: actions.length, failed: 0 };
  }
}

/** Stub repos with toggleable customer lookup. */
function makeRepos(knownCustomer?: { id: string; name: string; code: string }): BotRepos {
  return {
    async findCustomerByPhone() {
      return knownCustomer ?? null;
    },
    async createCustomer() {
      return {
        id: 'cust-test',
        code: 'JHR-TEST-100001',
        qrCodeUrl: 'https://stub.invalid/qr.png',
      };
    },
    async createPaymentLink({ amount }) {
      return { url: `https://rzp.io/l/test-${amount}` };
    },
    async activateSubscription() {
      return { subscriptionId: 'sub-test' };
    },
    async pauseSubscription() {},
    async resumeSubscription() {},
    async logSupportTicket() {},
    async getActiveSubscription() {
      return null;
    },
    async getActivePause() {
      return null;
    },
  };
}

describe('ConversationEngine — routing', () => {
  let store: InMemorySessionStore;
  let sender: CapturingSender;

  beforeEach(async () => {
    // Reset the module-level singleton store between tests.
    // We do this by clearing any prior state for our test phone numbers.
    store = sessionStore as unknown as InMemorySessionStore;
    sender = new CapturingSender();
    _resetIdempotencyForTests();
  });

  it('a NEW number saying "Hi" → kicks off onboarding (welcome template)', async () => {
    const engine = new ConversationEngine(makeRepos(/* unknown */), sender);
    const phone = '+919000000001';
    await store.clear(phone);

    await engine.process(makeText(phone, 'Hi'));

    expect(sender.outbox).toHaveLength(1);
    expect(sender.outbox[0]?.kind).toBe('template');
    if (sender.outbox[0]?.kind === 'template') {
      expect(sender.outbox[0].templateName).toBe('onboarding_welcome');
    }

    const state = await store.get(phone);
    expect(state?.flow).toBe('onboarding');
    expect(state?.step).toBe('ask_name');
  });

  it('a KNOWN number saying "Hi" → returning-customer menu (list reply)', async () => {
    const engine = new ConversationEngine(
      makeRepos({ id: 'cust-1', name: 'Subhransu', code: 'JHR-100482' }),
      sender,
    );
    const phone = '+919000000002';
    await store.clear(phone);

    await engine.process(makeText(phone, 'Hi'));

    expect(sender.outbox).toHaveLength(1);
    expect(sender.outbox[0]?.kind).toBe('list');
    if (sender.outbox[0]?.kind === 'list') {
      expect(sender.outbox[0].body).toContain('Subhransu');
      const rowIds = sender.outbox[0].sections.flatMap((s) => s.rows.map((r) => r.id));
      expect(rowIds).toEqual(['renew', 'pause', 'resume', 'support']);
    }

    const state = await store.get(phone);
    expect(state?.flow).toBe('menu');
    expect(state?.customerId).toBe('cust-1');
  });

  it('greets are case-insensitive and accept namaste/hello/menu', async () => {
    const engine = new ConversationEngine(makeRepos(), sender);
    for (const greet of ['hi', 'Hello', 'HEY', 'Namaste', 'menu']) {
      const phone = `+9190000${greet.length}${Math.random().toString().slice(2, 6)}`;
      await store.clear(phone);
      await engine.process(makeText(phone, greet));
      const state = await store.get(phone);
      expect(state?.flow).toBe('onboarding');
    }
  });

  it('drops messages mid-flow do not re-trigger the menu', async () => {
    // Once in onboarding ask_name, sending "Hi" again should NOT reset.
    // (Currently the menu flow only matches when state.flow === null, so this
    // documents that contract — if we ever change it, this test screams.)
    const engine = new ConversationEngine(
      makeRepos({ id: 'cust-1', name: 'A', code: 'JHR-1' }),
      sender,
    );
    const phone = '+919000000003';
    await store.clear(phone);

    await engine.process(makeText(phone, 'Hi'));
    sender.outbox.length = 0;

    // Pick 'renew' from menu — we're now in renew flow.
    await engine.process(makeList(phone, 'renew'));
    const state1 = await store.get(phone);
    expect(state1?.flow).toBe('renew');

    // Saying "Hi" mid-renew should not relaunch the menu.
    sender.outbox.length = 0;
    await engine.process(makeText(phone, 'Hi'));
    const state2 = await store.get(phone);
    expect(state2?.flow).toBe('renew');
  });
});

describe('ConversationEngine — onboarding payment calc', () => {
  it('produces a payment link template with correct ₹ math (litres × days × 64)', async () => {
    const sender = new CapturingSender();
    const engine = new ConversationEngine(makeRepos(), sender);
    const phone = '+919000000010';
    const store = sessionStore as unknown as InMemorySessionStore;
    await store.clear(phone);

    // Walk through the slots.
    await engine.process(makeText(phone, 'Hi')); // → ask_name
    await engine.process(makeText(phone, 'Subhransu Behera')); // → ask_address
    await engine.process(makeText(phone, 'Plot 47, Berhampur')); // → ask_email
    await engine.process(makeText(phone, 'a@b.c')); // → ask_alt_phone
    await engine.process(makeText(phone, 'skip')); // → ask_litres
    await engine.process(makeText(phone, '1')); // → ask_days
    sender.outbox.length = 0;
    await engine.process(makeText(phone, '30')); // → await_payment

    // Find the payment-link template the engine sent.
    const tpl = sender.outbox.find(
      (a) => a.kind === 'template' && a.templateName === 'onboarding_payment_link',
    );
    expect(tpl).toBeDefined();
    if (tpl?.kind === 'template') {
      // 1 L × 30 days × ₹64 = ₹1,920 — must match the WhatsApp Bot PDF.
      expect(tpl.variables).toEqual({
        litres: '1',
        days: '30',
        rate: '64',
        total: '1920',
      });
    }

    // And a Razorpay link should have been queued right after.
    const link = sender.outbox.find(
      (a) => a.kind === 'text' && a.body.startsWith('https://rzp.io/'),
    );
    expect(link).toBeDefined();
  });
});

describe('ConversationEngine — pause flow', () => {
  it('full happy path: menu → pause → start → end → confirm → done', async () => {
    const sender = new CapturingSender();
    const engine = new ConversationEngine(
      makeRepos({ id: 'cust-1', name: 'Subhransu', code: 'JHR-100482' }),
      sender,
    );
    const phone = '+919000000020';
    const store = sessionStore as unknown as InMemorySessionStore;
    await store.clear(phone);

    await engine.process(makeText(phone, 'Hi'));
    await engine.process(makeList(phone, 'pause'));
    await engine.process(makeText(phone, '2026-06-03'));
    await engine.process(makeText(phone, '2026-06-09'));
    sender.outbox.length = 0;
    await engine.process(makeButton(phone, 'pause_confirm', 'Confirm pause'));

    const done = sender.outbox.find(
      (a) => a.kind === 'template' && a.templateName === 'pause_done',
    );
    expect(done).toBeDefined();
    if (done?.kind === 'template') {
      expect(done.variables?.start_date).toBe('2026-06-03');
      expect(done.variables?.end_date).toBe('2026-06-09');
      expect(done.variables?.resume_date).toBe('2026-06-10');
    }

    const state = await store.get(phone);
    expect(state?.flow).toBeNull();
  });

  it('pause cancel button returns to top without scheduling', async () => {
    const sender = new CapturingSender();
    const engine = new ConversationEngine(
      makeRepos({ id: 'cust-1', name: 'A', code: 'JHR-1' }),
      sender,
    );
    const phone = '+919000000021';
    const store = sessionStore as unknown as InMemorySessionStore;
    await store.clear(phone);

    await engine.process(makeText(phone, 'Hi'));
    await engine.process(makeList(phone, 'pause'));
    await engine.process(makeText(phone, '2026-06-03'));
    await engine.process(makeText(phone, '2026-06-09'));
    sender.outbox.length = 0;
    await engine.process(makeButton(phone, 'pause_cancel', 'Cancel'));

    const done = sender.outbox.find(
      (a) => a.kind === 'template' && a.templateName === 'pause_done',
    );
    expect(done).toBeUndefined();
    const state = await store.get(phone);
    expect(state?.flow).toBeNull();
  });
});
