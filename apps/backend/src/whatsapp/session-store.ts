/**
 * Conversation state persistence.
 *
 * Production: Redis with key `wa:session:<phone>` and TTL of 24 hours.
 * Dev / no-Redis: in-process Map (resets on restart).
 *
 * Swap the export below for `new RedisSessionStore(redis)` once Redis is wired.
 */

import type { ConversationState } from './types';

export interface SessionStore {
  get(phone: string): Promise<ConversationState | null>;
  set(state: ConversationState): Promise<void>;
  clear(phone: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, ConversationState>();

  async get(phone: string): Promise<ConversationState | null> {
    const s = this.map.get(phone);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.map.delete(phone);
      return null;
    }
    return s;
  }

  async set(state: ConversationState): Promise<void> {
    this.map.set(state.phone, state);
  }

  async clear(phone: string): Promise<void> {
    this.map.delete(phone);
  }
}

export const sessionStore: SessionStore = new InMemorySessionStore();

/** Build a fresh state object. 24h expiry by default. */
export function freshState(phone: string): ConversationState {
  const now = Date.now();
  return {
    phone,
    flow: null,
    step: null,
    context: {},
    updatedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };
}
