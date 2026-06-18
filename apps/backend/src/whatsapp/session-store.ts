/**
 * Conversation state persistence.
 *
 * Production (REDIS_URL set): Redis at key `wa:session:<phone>` with TTL — so
 * sessions survive restarts and are shared across API instances (audit
 * EDG-01/CUS-06/BAC-10/PER-07: the in-memory Map lost all state on restart,
 * broke multi-instance, and never evicted expired sessions).
 * Dev / no-Redis: in-process Map (resets on restart, single-instance only).
 */

import type { ConversationState } from './types';
import { getRedisOptional, isRedisEnabled } from '../redis';

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

export class RedisSessionStore implements SessionStore {
  private key(phone: string): string {
    return `wa:session:${phone}`;
  }

  async get(phone: string): Promise<ConversationState | null> {
    const redis = getRedisOptional();
    if (!redis) return null;
    const raw = await redis.get(this.key(phone));
    if (!raw) return null;
    const state = JSON.parse(raw) as ConversationState;
    if (state.expiresAt < Date.now()) {
      await redis.del(this.key(phone));
      return null;
    }
    return state;
  }

  async set(state: ConversationState): Promise<void> {
    const redis = getRedisOptional();
    if (!redis) return;
    // Let Redis evict the key when the conversation window expires (fixes the
    // unbounded-growth leak of the in-memory store).
    const ttlSec = Math.max(1, Math.ceil((state.expiresAt - Date.now()) / 1000));
    await redis.set(this.key(state.phone), JSON.stringify(state), 'EX', ttlSec);
  }

  async clear(phone: string): Promise<void> {
    const redis = getRedisOptional();
    if (!redis) return;
    await redis.del(this.key(phone));
  }
}

export const sessionStore: SessionStore = isRedisEnabled()
  ? new RedisSessionStore()
  : new InMemorySessionStore();

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
