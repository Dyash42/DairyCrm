'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { fetchAuditLog, type AuditEvent } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';

type KindFilter = 'ALL' | AuditEvent['kind'];

const KIND_LABEL: Record<AuditEvent['kind'], string> = {
  QR_REVOKED: 'QR revoked',
  DELIVERY_SCANNED: 'Delivery scanned',
  DELIVERY_MISSED: 'Delivery missed',
};

const KIND_TONE: Record<AuditEvent['kind'], PillTone> = {
  QR_REVOKED: 'warning',
  DELIVERY_SCANNED: 'success',
  DELIVERY_MISSED: 'danger',
};

function KindIcon({ kind }: { kind: AuditEvent['kind'] }) {
  if (kind === 'QR_REVOKED')
    return <ShieldAlert size={14} className="text-warning-dark" />;
  if (kind === 'DELIVERY_SCANNED')
    return <CheckCircle2 size={14} className="text-success-dark" />;
  return <XCircle size={14} className="text-danger-dark" />;
}

export default function AuditLogPage() {
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');

  const { data: events, source } = useApiWithFallback(
    () => fetchAuditLog(200),
    (raw) => raw.events,
    [] as AuditEvent[],
  );

  const rows = useMemo(
    () => events.filter((e) => kindFilter === 'ALL' || e.kind === kindFilter),
    [events, kindFilter],
  );

  return (
    <>
      <Topbar
        title="Audit log"
        subtitle="QR revocations + delivery events — last 200"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6 max-w-5xl">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={14} className="mr-1" />
            Back to settings
          </Link>
        </div>

        <Card>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 gap-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Recent events
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {source === 'mock' && 'Showing demo data — backend unreachable.'}
                {source === 'live' && `${rows.length} events`}
              </p>
            </div>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="input"
            >
              <option value="ALL">All kinds</option>
              <option value="QR_REVOKED">QR revoked</option>
              <option value="DELIVERY_SCANNED">Delivery scanned</option>
              <option value="DELIVERY_MISSED">Delivery missed</option>
            </select>
          </div>
          <div className="overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Customer</th>
                  <th>Actor</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={`${e.ts}-${i}`}>
                    <td className="text-text-secondary tabular text-xs">
                      {new Date(e.ts).toLocaleString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <KindIcon kind={e.kind} />
                        <StatusPill tone={KIND_TONE[e.kind]}>
                          {KIND_LABEL[e.kind]}
                        </StatusPill>
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/customers/${e.customer.id}`}
                        className="text-brand hover:underline"
                      >
                        {e.customer.name}
                      </Link>
                      <div className="text-xs text-text-muted">
                        {e.customer.code}
                      </div>
                    </td>
                    <td className="text-text-secondary text-sm">
                      {e.actor ?? '—'}
                    </td>
                    <td className="text-sm text-text-primary">{e.detail}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-text-muted">
                      No events for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
