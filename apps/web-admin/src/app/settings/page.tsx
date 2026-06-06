'use client';

import { Save } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';

export default function SettingsPage() {
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
            <Field
              label="Cow milk (₹ per litre)"
              defaultValue="64"
              suffix="₹/L"
            />
            <Field
              label="Buffalo milk (₹ per litre)"
              defaultValue="78"
              suffix="₹/L"
            />
            <Field
              label="A2 milk (₹ per litre)"
              defaultValue="110"
              suffix="₹/L"
            />
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
              <SkuRow name="Cow milk" code="COW_MILK" active />
              <SkuRow name="Buffalo milk" code="BUFFALO_MILK" active />
              <SkuRow name="A2 milk" code="A2_MILK" active={false} />
              <SkuRow name="Curd 500g" code="CURD_500" active />
              <SkuRow name="Ghee 200ml" code="GHEE_200" active={false} />
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
            <HolidayRow date="28 May 2026" reason="Buddha Purnima" />
            <HolidayRow date="14 Aug 2026" reason="Janmashtami" />
            <HolidayRow date="2 Oct 2026" reason="Gandhi Jayanti" />
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
            <Field label="Morning start" defaultValue="05:30" suffix="AM" />
            <Field label="Morning end" defaultValue="08:30" suffix="AM" />
          </CardBody>
        </Card>
      </div>
    </>
  );
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
