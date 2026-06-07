'use client';

import { useState, use } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Phone,
  MapPin,
  RefreshCw,
  Download,
  CheckCircle2,
  Pause,
  XCircle,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { getInitials } from '@/lib/mock-data';
import {
  fetchCustomerDetail,
  fetchCustomerQr,
  regenerateCustomerQr,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR, formatLitres } from '@jharanai/shared';

const STATUS_TONE: Record<string, PillTone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  CANCELLED: 'danger',
};

export default function CustomerDetailPage() {
  const params = useParams() as { id: string };
  const customerId = params.id;

  const { data: customer, source } = useApiWithFallback(
    () => fetchCustomerDetail(customerId),
    (raw) => raw,
    null as Awaited<ReturnType<typeof fetchCustomerDetail>> | null,
    [customerId],
  );

  const { data: qr, reload: reloadQr } = useApiWithFallback(
    () => fetchCustomerQr(customerId),
    (raw) => raw,
    null as { code: string; dataUrl: string } | null,
    [customerId],
  );

  const [regenerating, setRegenerating] = useState(false);

  async function onRegenerate() {
    const reason = window.prompt(
      'Why are you regenerating this QR? (visible in audit log)',
      'Customer reported lost QR',
    );
    if (reason === null) return;
    setRegenerating(true);
    try {
      await regenerateCustomerQr(customerId, reason || undefined);
      reloadQr();
    } finally {
      setRegenerating(false);
    }
  }

  if (!customer) {
    return (
      <>
        <Topbar title="Customer" subtitle="Loading…" />
        <div className="px-8 py-6 text-text-secondary">
          {source === 'mock' ? 'No data — backend unreachable.' : 'Loading customer detail…'}
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={customer.name}
        subtitle={`${customer.code} · ${customer.route?.name ?? 'No route'}`}
      />
      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={14} className="mr-1" />
            All customers
          </Link>
        </div>

        {/* Header */}
        <Card className="p-5 flex items-start gap-5">
          <Avatar initials={getInitials(customer.name)} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-text-primary">
                {customer.name}
              </h2>
              <StatusPill tone={STATUS_TONE[customer.status] ?? 'muted'}>
                {customer.status}
              </StatusPill>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <Phone size={13} /> {customer.phone}
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={13} /> {customer.addressLine1}
              </div>
              <div>
                <span className="text-text-muted">Code:</span>{' '}
                <span className="tabular font-medium text-text-primary">
                  {customer.code}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Litres/day:</span>{' '}
                <span className="tabular font-medium text-text-primary">
                  {formatLitres(Number(customer.litresPerDay))}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* QR card */}
          <Card>
            <CardHeader
              title="Customer QR"
              subtitle="Shown to the milkman at delivery"
              action={
                <button
                  onClick={onRegenerate}
                  disabled={regenerating}
                  className="btn-secondary disabled:opacity-50"
                >
                  <RefreshCw size={14} />
                  {regenerating ? 'Working…' : 'Regenerate'}
                </button>
              }
            />
            <CardBody className="flex flex-col items-center">
              {qr ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr.dataUrl}
                    alt={`QR for ${qr.code}`}
                    className="w-48 h-48 rounded-lg border border-border"
                  />
                  <a
                    href={qr.dataUrl}
                    download={`${qr.code}.png`}
                    className="mt-3 text-sm text-brand hover:text-brand-600 inline-flex items-center gap-1"
                  >
                    <Download size={13} /> Download PNG
                  </a>
                  <div className="mt-2 text-xs text-text-muted tabular">
                    {qr.code}
                  </div>
                </>
              ) : (
                <div className="text-sm text-text-muted py-8">
                  QR not available
                </div>
              )}
            </CardBody>
          </Card>

          {/* Subscription history */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Subscription history"
              subtitle={`${customer.subscriptions.length} total`}
            />
            <CardBody>
              {customer.subscriptions.length === 0 ? (
                <EmptyState message="No subscriptions yet" />
              ) : (
                <ul className="divide-y divide-divider">
                  {customer.subscriptions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <div className="font-medium text-text-primary">
                          {s.sku} · {Number(s.litresPerDay)} L/day
                        </div>
                        <div className="text-xs text-text-muted">
                          {new Date(s.startDate).toLocaleDateString()} →{' '}
                          {s.endDate
                            ? new Date(s.endDate).toLocaleDateString()
                            : 'ongoing'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular text-sm text-text-secondary">
                          ₹{Number(s.ratePerLitre)}/L
                        </span>
                        <StatusPill tone={STATUS_TONE[s.status] ?? 'muted'}>
                          {s.status}
                        </StatusPill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Payments history */}
        <Card>
          <CardHeader
            title="Payment history"
            subtitle={`Last ${customer.payments.length}`}
          />
          <CardBody>
            {customer.payments.length === 0 ? (
              <EmptyState message="No payments yet" />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="text-text-secondary">
                        {new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}
                      </td>
                      <td>{p.mode}</td>
                      <td>
                        <StatusPill
                          tone={
                            p.status === 'PAID'
                              ? 'success'
                              : p.status === 'FAILED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {p.status}
                        </StatusPill>
                      </td>
                      <td className="tabular font-semibold">
                        {formatINR(Number(p.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        {/* Pause history */}
        <Card>
          <CardHeader
            title="Pause history"
            subtitle={`${customer.pauses.length} pauses`}
          />
          <CardBody>
            {customer.pauses.length === 0 ? (
              <EmptyState message="No pauses recorded" />
            ) : (
              <ul className="divide-y divide-divider">
                {customer.pauses.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium text-text-primary tabular">
                        {new Date(p.startDate).toLocaleDateString()} →{' '}
                        {new Date(p.endDate).toLocaleDateString()}
                      </div>
                      {p.reason && (
                        <div className="text-xs text-text-muted">{p.reason}</div>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary">
                      Resumes {new Date(p.resumeDate).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-text-muted text-sm">{message}</div>
  );
}
