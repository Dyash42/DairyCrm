import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemorySessionStore, freshState } from './session-store';

describe('session-store', () => {
  describe('freshState', () => {
    it('initializes with null flow, null step, empty context', () => {
      const s = freshState('+919999999999');
      expect(s.flow).toBeNull();
      expect(s.step).toBeNull();
      expect(s.context).toEqual({});
      expect(s.phone).toBe('+919999999999');
    });

    it('sets expiresAt to ~24 hours from now', () => {
      const before = Date.now();
      const s = freshState('+919999999999');
      const after = Date.now();
      const day = 24 * 60 * 60 * 1000;
      expect(s.expiresAt).toBeGreaterThanOrEqual(before + day);
      expect(s.expiresAt).toBeLessThanOrEqual(after + day);
    });
  });

  describe('InMemorySessionStore', () => {
    let store: InMemorySessionStore;

    beforeEach(() => {
      store = new InMemorySessionStore();
    });

    it('returns null for unknown phone', async () => {
      expect(await store.get('+919999999999')).toBeNull();
    });

    it('round-trips state', async () => {
      const s = freshState('+919999999999');
      await store.set(s);
      expect(await store.get('+919999999999')).toEqual(s);
    });

    it('expires state past expiresAt', async () => {
      const s = freshState('+919999999999');
      s.expiresAt = Date.now() - 1000;
      await store.set(s);
      expect(await store.get('+919999999999')).toBeNull();
    });

    it('clear removes the state', async () => {
      const s = freshState('+919999999999');
      await store.set(s);
      await store.clear('+919999999999');
      expect(await store.get('+919999999999')).toBeNull();
    });
  });
});
