import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationEngine, _resetIdempotencyForTests } from './engine';
import { WhatsAppSender } from './sender';
import { InMemorySessionStore, sessionStore } from './session-store';
import type { BotRepos, InboundMessage, OutboundAction } from './types';

class CapturingSender extends WhatsAppSender {
  public outbox: OutboundAction[] = [];
  override async send(action: OutboundAction) {
    this.outbox.push(action);
    return { messageId: `cap-${this.outbox.length}` };
  }
  override async sendBatch(actions: OutboundAction[]) {
    for (const a of actions) await this.send(a);
    return { sent: actions.length, failed: 0 };
  }
}

const repos: BotRepos = {
  async findCustomerByPhone() {
    return null;
  },
  async createCustomer() {
    return { id: 'c1', code: 'JHR-TEST', qrCodeUrl: 'data:,' };
  },
  async createPaymentLink() {
    return { url: 'https://rzp.io/l/stub', paymentId: 'pay-stub' };
  },
  async getPaymentStatus() {
    return 'PAID';
  },
  async consumePaymentIntent() {
    return null;
  },
  async getRatePerLitre() {
    return 64;
  },
  async saveCustomerLocation() {},
  async createLocationToken() {
    return { token: 'tok-stub', expiresAt: new Date(Date.now() + 86_400_000) };
  },
  async activateSubscription() {
    return { subscriptionId: 's1' };
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

describe('engine idempotency — Meta webhook retries are safe', () => {
  let store: InMemorySessionStore;
  let sender: CapturingSender;
  let engine: ConversationEngine;
  const phone = '+919876543210';

  beforeEach(async () => {
    store = sessionStore as unknown as InMemorySessionStore;
    await store.clear(phone);
    sender = new CapturingSender();
    engine = new ConversationEngine(repos, sender);
    _resetIdempotencyForTests();
  });

  it('processes a fresh messageId exactly once', async () => {
    const msg: InboundMessage = {
      kind: 'text',
      from: phone,
      text: 'Hi',
      messageId: 'wamid.unique-1',
      timestamp: Date.now(),
    };

    await engine.process(msg);
    const firstCount = sender.outbox.length;
    expect(firstCount).toBeGreaterThan(0);

    // Meta retry — same messageId. Should produce ZERO additional sends.
    await engine.process(msg);
    expect(sender.outbox.length).toBe(firstCount);
  });

  it('does not block different messageIds from the same phone', async () => {
    await engine.process({
      kind: 'text',
      from: phone,
      text: 'Hi',
      messageId: 'wamid.A',
      timestamp: Date.now(),
    });
    const after1 = sender.outbox.length;

    await engine.process({
      kind: 'text',
      from: phone,
      text: 'Subhransu',
      messageId: 'wamid.B',
      timestamp: Date.now(),
    });
    expect(sender.outbox.length).toBeGreaterThan(after1);
  });
});
