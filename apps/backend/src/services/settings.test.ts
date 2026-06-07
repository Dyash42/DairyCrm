import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from './settings';

vi.mock('../prisma', () => {
  const store = new Map<string, { value: string; type: string }>();
  return {
    prisma: {
      setting: {
        async findUnique({ where }: { where: { key: string } }) {
          const row = store.get(where.key);
          if (!row) return null;
          return { ...row, group: 'test', label: 'test', editable: true, description: null, updatedAt: new Date(), updatedBy: null, key: where.key };
        },
        async findMany() {
          return Array.from(store.entries()).map(([key, v]) => ({
            key, ...v, group: 'test', label: 'test',
            editable: true, description: null, updatedAt: new Date(), updatedBy: null,
          }));
        },
        async upsert({ where, create, update }: any) {
          const existing = store.get(where.key);
          if (existing) {
            store.set(where.key, { ...existing, value: update.value });
            return { ...existing, ...update, key: where.key };
          }
          store.set(where.key, { value: create.value, type: create.type });
          return { ...create, updatedAt: new Date() };
        },
      },
    },
    /** Test helper exported so tests can clear between cases */
    __testStore: store,
  };
});

describe('SettingsService', () => {
  let svc: SettingsService;

  beforeEach(() => {
    svc = new SettingsService();
    svc._clearCacheForTests();
  });

  it('returns the default when no row exists', async () => {
    const v = await svc.getNumber('subscription.default_duration_days', 30);
    expect(v).toBe(30);
  });

  it('round-trips a number setting', async () => {
    await svc.set('subscription.default_duration_days', 45);
    svc._clearCacheForTests();
    const v = await svc.getNumber('subscription.default_duration_days', 30);
    expect(v).toBe(45);
  });

  it('round-trips a string setting', async () => {
    await svc.set('delivery.morning_window_start', '06:00');
    svc._clearCacheForTests();
    const v = await svc.getString('delivery.morning_window_start', '05:30');
    expect(v).toBe('06:00');
  });

  it('round-trips a boolean setting', async () => {
    await svc.set('feature.x_enabled', true);
    svc._clearCacheForTests();
    const v = await svc.getBool('feature.x_enabled', false);
    expect(v).toBe(true);
  });

  it('uses cache on repeated reads', async () => {
    await svc.set('subscription.default_duration_days', 99);
    const v1 = await svc.getNumber('subscription.default_duration_days', 30);
    expect(v1).toBe(99);
    // Reading again should not re-query (we don't assert that directly,
    // but at least the value is consistent).
    const v2 = await svc.getNumber('subscription.default_duration_days', 30);
    expect(v2).toBe(99);
  });

  it('set() invalidates the cache immediately', async () => {
    await svc.set('subscription.default_duration_days', 10);
    expect(await svc.getNumber('subscription.default_duration_days', 0)).toBe(10);
    await svc.set('subscription.default_duration_days', 20);
    expect(await svc.getNumber('subscription.default_duration_days', 0)).toBe(20);
  });

  it('listAllGrouped() merges defaults + rows and flags isDefault', async () => {
    await svc.set('subscription.default_duration_days', 42);
    const groups = await svc.listAllGrouped();
    const sub = groups['subscription'] ?? [];
    const customized = sub.find((s) => s.key === 'subscription.default_duration_days');
    const untouched = sub.find((s) => s.key === 'subscription.renewal_reminder_days_before');
    expect(customized?.value).toBe(42);
    expect(customized?.isDefault).toBe(false);
    expect(untouched?.isDefault).toBe(true);
  });
});
