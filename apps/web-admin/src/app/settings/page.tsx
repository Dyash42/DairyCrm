'use client';

import { Save } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchSettings, fetchHolidays } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';

const FALLBACK_SETTINGS = {
  rates: { COW_MILK: 64, BUFFALO_MILK: 78, A2_MILK: 110 },
  skus: [
    { code: 'COW_MILK', name: 'Cow milk', active: true },
    { code: 'BUFFALO_MILK', name: 'Buffalo milk', active: true },
    { code: 'A2_MILK', name: 'A2 milk', active: false },
    { code: 'CURD_500', name: 'Curd 500g', active: true },
    { code: 'GHEE_200', name: 'Ghee 200ml', active: false },
  ],
  deliveryWindow: { morningStart: '05:30', morningEnd: '08:30' },
};

const FALLBACK_HOLIDAYS = [
  { id: 'h1', date: '2026-05-28', reason: 'Buddha Purnima', scope: 'ALL' },
  { id: 'h2', date: '2026-08-14', reason: 'Janmashtami', scope: 'ALL' },
  { id: 'h3', date: '2026-10-02', reason: 'Gandhi Jayanti', scope: 'ALL' },
];

export default function SettingsPage() {
  const { data: settings } = useApiWithFallback(
    fetchSettings,
    (raw) => raw,
    FALLBACK_SETTINGS,
  );
  const { data: holidays } = useApiWithFallback(
    fetchHolidays,
    (raw) => raw.holidays,
    FALLBACK_HOLIDAYS,
  );

  return (
    <>
      <Topbar
        title="Settings"
        subtitle="Pricing, products, holidays and business hours"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6 max-w-4xl">
        {/* Rate card */}
        <Card>
          <CardHeader
            title="Rate card"
            subtitle="Applied to every new subscription and renewal"
            action={
              <button className="btn-primary">
                <Save size={16} />
                Save
              </button>
            }
          />
          <CardBody className="space-y-4">
            {Object.entries(settings.rates).map(([sku, rate]) => (
              <Field
                key={sku}
                label={`${humanSku(sku)} (₹ per litre)`}
                defaultValue={String(rate)}
                suffix="₹/L"
              />
            ))}
          </CardBody>
        </Card>

        {/* SKUs */}
        <Card>
          <CardHeader
            title="Products / SKUs"
            subtitle="What customers can subscribe to"
          />
          <CardBody>
            <ul className="divide-y divide-divider">
              {settings.skus.map((sku) => (
                <SkuRow
                  key={sku.code}
                  name={sku.name}
                  code={sku.code}
                  active={sku.active}
                />
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* Holidays */}
        <Card>
          <CardHeader
            title="Holidays"
            subtitle="No deliveries on these days · subscriptions auto-skip"
          />
          <CardBody className="space-y-3">
            {holidays.map((h) => (
              <HolidayRow
                key={h.id}
                date={new Date(h.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                reason={h.reason}
              />
            ))}
            <button className="text-sm text-brand font-medium hover:text-brand-600">
              + Add holiday
            </button>
          </CardBody>
        </Card>

        {/* Business hours */}
        <Card>
          <CardHeader
            title="Delivery window"
            subtitle="When milkmen are out on routes"
          />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field
              label="Morning start"
              defaultValue={settings.deliveryWindow.morningStart}
              suffix="AM"
            />
            <Field
              label="Morning end"
              defaultValue={settings.deliveryWindow.morningEnd}
              suffix="AM"
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function humanSku(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function Field({
  label,
  defaultValue,
  suffix,
}: {
  label: string;
  defaultValue: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-text-secondary flex-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          defaultValue={defaultValue}
          className="input w-32 text-right tabular"
        />
        {suffix && (
          <span className="text-sm text-text-muted w-12">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function SkuRow({
  name,
  code,
  active,
}: {
  name: string;
  code: string;
  active: boolean;
}) {
  return (
    <li className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div>
        <div className="text-sm font-semibold text-text-primary">{name}</div>
        <div className="text-xs text-text-muted">{code}</div>
      </div>
      <StatusPill tone={active ? 'success' : 'muted'}>
        {active ? 'Active' : 'Hidden'}
      </StatusPill>
    </li>
  );
}

function HolidayRow({ date, reason }: { date: string; reason: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-muted">
      <div>
        <div className="text-sm font-semibold text-text-primary tabular">
          {date}
        </div>
        <div className="text-xs text-text-muted">{reason}</div>
      </div>
      <button className="text-xs text-danger hover:text-danger-dark font-medium">
        Remove
      </button>
    </div>
  );
}
