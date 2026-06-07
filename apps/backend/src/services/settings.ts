/**
 * Settings service — runtime-editable configuration.
 *
 * Philosophy: NO BUSINESS NUMBER IS HARDCODED. The `constants.ts` file
 * holds the *defaults*. Admin can override any setting via the Settings
 * page; the DB row wins at runtime. Fresh installs use the defaults.
 *
 * Cache:
 *   - 60-second in-process TTL per key, hot enough for every flow call
 *     to read without a DB hit
 *   - set() invalidates immediately so the next read sees the new value
 *   - In a multi-process setup, settings updates should publish a Redis
 *     invalidation message — TODO once we run multiple backend nodes
 *
 * Type safety:
 *   - getNumber / getString / getBool / getJson<T>() with default values
 *   - The default is also the source of truth for fallback when the row
 *     doesn't exist (which is the case on a fresh DB)
 */

import { SettingType } from '@prisma/client';

import { prisma } from '../prisma';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  description?: string;
  type: SettingType;
  /** JSON-encoded default (matches `value` column shape). */
  defaultValue: string;
  /** false → setting is read-only in admin UI (e.g. managed via env). */
  editable?: boolean;
}

/**
 * The single source of truth for every configurable setting. When you add a
 * new one, list it here with its default — the admin UI will pick it up
 * automatically, the seed will write the row, and code can read it with a
 * typed getter.
 */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // ----------- Subscription -----------
  {
    key: 'subscription.default_duration_days',
    group: 'subscription',
    label: 'Default subscription length (days)',
    description: 'How many days a new subscription covers by default.',
    type: SettingType.NUMBER,
    defaultValue: '30',
  },
  {
    key: 'subscription.renewal_reminder_days_before',
    group: 'subscription',
    label: 'Renewal reminder window (days before expiry)',
    description: 'How many days before subscription end to send the renewal reminder.',
    type: SettingType.NUMBER,
    defaultValue: '3',
  },
  // ----------- Pause -----------
  {
    key: 'pause.max_days',
    group: 'pause',
    label: 'Maximum pause length (days)',
    description: 'Customers cannot pause for more than this many days at a time.',
    type: SettingType.NUMBER,
    defaultValue: '60',
  },
  // ----------- Delivery -----------
  {
    key: 'delivery.morning_window_start',
    group: 'delivery',
    label: 'Morning delivery window start',
    type: SettingType.STRING,
    defaultValue: '"05:30"',
  },
  {
    key: 'delivery.morning_window_end',
    group: 'delivery',
    label: 'Morning delivery window end',
    type: SettingType.STRING,
    defaultValue: '"08:30"',
  },
  // ----------- Customer -----------
  {
    key: 'customer.code_prefix',
    group: 'customer',
    label: 'Customer code prefix',
    description: 'The "JHR" in JHR-100455. Change with caution — existing codes do not change.',
    type: SettingType.STRING,
    defaultValue: '"JHR"',
  },
  // ----------- OTP -----------
  {
    key: 'otp.length',
    group: 'otp',
    label: 'OTP digit length',
    type: SettingType.NUMBER,
    defaultValue: '6',
  },
  {
    key: 'otp.expiry_minutes',
    group: 'otp',
    label: 'OTP expiry (minutes)',
    type: SettingType.NUMBER,
    defaultValue: '5',
  },
  // ----------- Business / Brand -----------
  {
    key: 'business.brand_name',
    group: 'business',
    label: 'Brand name (shown to customers)',
    type: SettingType.STRING,
    defaultValue: '"Jharanai"',
  },
  {
    key: 'business.support_phone',
    group: 'business',
    label: 'Support phone shown in WhatsApp footer',
    type: SettingType.STRING,
    defaultValue: '""',
  },
];

function parseValue(raw: string, type: SettingType): unknown {
  if (type === SettingType.STRING) {
    // Stored as JSON-encoded string for consistency
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (type === SettingType.NUMBER) return Number(JSON.parse(raw));
  if (type === SettingType.BOOLEAN) return Boolean(JSON.parse(raw));
  return JSON.parse(raw);
}

function inferType(value: unknown): SettingType {
  if (typeof value === 'string') return SettingType.STRING;
  if (typeof value === 'number') return SettingType.NUMBER;
  if (typeof value === 'boolean') return SettingType.BOOLEAN;
  return SettingType.JSON;
}

export class SettingsService {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
    const value = row ? (parseValue(row.value, row.type) as T) : defaultValue;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  async getNumber(key: string, defaultValue: number): Promise<number> {
    return this.get<number>(key, defaultValue);
  }

  async getString(key: string, defaultValue: string): Promise<string> {
    return this.get<string>(key, defaultValue);
  }

  async getBool(key: string, defaultValue: boolean): Promise<boolean> {
    return this.get<boolean>(key, defaultValue);
  }

  /** Update or create a setting; cache invalidated immediately. */
  async set(key: string, value: unknown, updatedBy?: string): Promise<void> {
    const def = SETTING_DEFINITIONS.find((d) => d.key === key);
    const type = def?.type ?? inferType(value);
    const encoded = JSON.stringify(value);
    await prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: encoded,
        type,
        group: def?.group ?? 'misc',
        label: def?.label ?? key,
        description: def?.description ?? null,
        editable: def?.editable ?? true,
        updatedBy: updatedBy ?? null,
      },
      update: { value: encoded, updatedBy: updatedBy ?? null },
    });
    cache.delete(key);
  }

  /** Read every defined setting (DB row OR default), grouped for the admin UI. */
  async listAllGrouped(): Promise<
    Record<string, Array<SettingDefinition & { value: unknown; isDefault: boolean }>>
  > {
    const rows = await prisma.setting.findMany();
    const rowByKey = new Map(rows.map((r) => [r.key, r]));
    const out: Record<string, Array<SettingDefinition & { value: unknown; isDefault: boolean }>> = {};

    for (const def of SETTING_DEFINITIONS) {
      const row = rowByKey.get(def.key);
      const value = row
        ? parseValue(row.value, row.type)
        : parseValue(def.defaultValue, def.type);
      const isDefault = !row;
      const entry = { ...def, value, isDefault };
      (out[def.group] ??= []).push(entry);
    }
    return out;
  }

  _clearCacheForTests(): void {
    cache.clear();
  }
}

export const settings = new SettingsService();
