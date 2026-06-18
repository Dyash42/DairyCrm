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

/** Inactivity window for a conversation. A 24h sliding TTL (audit CUS-11). */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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
    // Sliding window: an active conversation shouldn't expire mid-flow just
    // because the customer paused between answers (audit CUS-11). Refresh the
    // 24h window on each inbound read.
    s.expiresAt = Date.now() + SESSION_TTL_MS;
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
    // Sliding window: refresh the 24h expiry (both the in-payload value and the
    // Redis key TTL) on each inbound so an in-progress flow doesn't expire
    // between the customer's answers (audit CUS-11).
    const ttlSec = SESSION_TTL_MS / 1000;
    state.expiresAt = Date.now() + SESSION_TTL_MS;
    await redis.set(this.key(phone), JSON.stringify(state), 'EX', ttlSec);
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
    expiresAt: now + SESSION_TTL_MS,
  };
}
