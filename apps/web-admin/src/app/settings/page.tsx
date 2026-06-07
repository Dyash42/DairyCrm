'use client';

import { useState } from 'react';
import { Save, Plus } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { fetchSettings, updateSetting, fetchHolidays, type SettingRow } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';

const FALLBACK_SETTINGS: Record<string, SettingRow[]> = {
  subscription: [
    {
      key: 'subscription.default_duration_days',
      group: 'subscription',
      label: 'Default subscription length (days)',
      type: 'NUMBER',
      value: 30,
      isDefault: true,
    },
    {
      key: 'subscription.renewal_reminder_days_before',
      group: 'subscription',
      label: 'Renewal reminder window (days before expiry)',
      type: 'NUMBER',
      value: 3,
      isDefault: true,
    },
  ],
  pause: [
    {
      key: 'pause.max_days',
      group: 'pause',
      label: 'Maximum pause length (days)',
      type: 'NUMBER',
      value: 60,
      isDefault: true,
    },
  ],
  delivery: [
    {
      key: 'delivery.morning_window_start',
      group: 'delivery',
      label: 'Morning delivery window start',
      type: 'STRING',
      value: '05:30',
      isDefault: true,
    },
    {
      key: 'delivery.morning_window_end',
      group: 'delivery',
      label: 'Morning delivery window end',
      type: 'STRING',
      value: '08:30',
      isDefault: true,
    },
  ],
};

const FALLBACK_HOLIDAYS = [
  { id: 'h1', date: '2026-05-28', reason: 'Buddha Purnima', scope: 'ALL' },
  { id: 'h2', date: '2026-08-14', reason: 'Janmashtami', scope: 'ALL' },
  { id: 'h3', date: '2026-10-02', reason: 'Gandhi Jayanti', scope: 'ALL' },
];

const GROUP_META: Record<string, { title: string; subtitle: string }> = {
  business: { title: 'Brand', subtitle: 'How customers see you' },
  subscription: { title: 'Subscription rules', subtitle: 'Length and renewal behavior' },
  pause: { title: 'Pause rules', subtitle: 'Constraints on pausing' },
  delivery: { title: 'Delivery window', subtitle: 'When milkmen are out on routes' },
  customer: { title: 'Customer codes', subtitle: 'Format of generated customer IDs' },
  otp: { title: 'Executive OTP', subtitle: 'Mobile login security' },
};

export default function SettingsPage() {
  const { data: groups, reload } = useApiWithFallback(
    fetchSettings,
    (raw) => raw.groups,
    FALLBACK_SETTINGS,
  );

  return (
    <>
      <Topbar
        title="Settings"
        subtitle="All business logic editable — no code changes needed"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6 max-w-4xl">
        {Object.entries(groups).map(([groupKey, rows]) => {
          const meta = GROUP_META[groupKey] ?? { title: groupKey, subtitle: '' };
          return (
            <GroupCard
              key={groupKey}
              title={meta.title}
              subtitle={meta.subtitle}
              rows={rows}
              onSaved={reload}
            />
          );
        })}

        <HolidaysCard />
      </div>
    </>
  );
}

function GroupCard({
  title,
  subtitle,
  rows,
  onSaved,
}: {
  title: string;
  subtitle: string;
  rows: SettingRow[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, String(r.value ?? '')])),
  );
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const dirtyKeys = rows.filter((r) => String(r.value ?? '') !== draft[r.key]);

  async function onSave() {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      for (const r of dirtyKeys) {
        const raw = draft[r.key] ?? '';
        let parsed: unknown = raw;
        if (r.type === 'NUMBER') parsed = Number(raw);
        if (r.type === 'BOOLEAN') parsed = raw === 'true';
        await updateSetting(r.key, parsed);
        setSavedKey(r.key);
      }
      onSaved();
      setTimeout(() => setSavedKey(null), 1500);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <button
            onClick={onSave}
            disabled={dirtyKeys.length === 0 || saving}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Saving…' : `Save${dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}`}
          </button>
        }
      />
      <CardBody className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <label className="text-sm text-text-primary block">
                {r.label}
                {r.isDefault && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-text-muted">
                    default
                  </span>
                )}
                {savedKey === r.key && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-success-dark">
                    saved
                  </span>
                )}
              </label>
              {r.description && (
                <p className="text-xs text-text-muted mt-0.5">{r.description}</p>
              )}
            </div>
            <input
              value={draft[r.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
              type={r.type === 'NUMBER' ? 'number' : 'text'}
              className="input w-40 tabular text-right"
            />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function HolidaysCard() {
  const { data: holidays } = useApiWithFallback(
    fetchHolidays,
    (raw) => raw.holidays,
    FALLBACK_HOLIDAYS,
  );

  return (
    <Card>
      <CardHeader
        title="Holidays"
        subtitle="No deliveries on these days · subscriptions auto-skip"
      />
      <CardBody className="space-y-3">
        {holidays.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-muted"
          >
            <div>
              <div className="text-sm font-semibold text-text-primary tabular">
                {new Date(h.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
              <div className="text-xs text-text-muted">{h.reason}</div>
            </div>
            <button className="text-xs text-danger hover:text-danger-dark font-medium">
              Remove
            </button>
          </div>
        ))}
        <button className="text-sm text-brand font-medium hover:text-brand-600 inline-flex items-center gap-1">
          <Plus size={14} />
          Add holiday
        </button>
      </CardBody>
    </Card>
  );
}
