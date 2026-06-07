'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, ExternalLink, Receipt } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchPayments } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR } from '@jharanai/shared';

type ModeFilter = 'ALL' | 'CASH' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET';

export default function PaymentsPage() {
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');

  const { data: payments, source } = useApiWithFallback(
    () => fetchPayments({ limit: 200 }),
    (raw) => raw.payments,
    [] as Awaited<ReturnType<typeof fetchPayments>>['payments'],
  );

  const rows = useMemo(
    () => payments.filter((p) => modeFilter === 'ALL' || p.mode === modeFilter),
    [payments, modeFilter],
  );

  const collected = rows
    .filter((p) => p.status === 'PAID')
    .reduce((s, p) => s + Number(p.amount), 0);
  const pendingAmt = rows
    .filter((p) => p.status === 'PENDING')
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <Topbar
        title="Payments"
        subtitle="Every payment received · webhook + cash"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        {/* Tab nav between invoices & payments */}
        <div className="flex items-center gap-4 border-b border-divider">
          <Link
            href="/billing"
            className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <Receipt size={14} className="inline mr-1" />
            Invoices
          </Link>
          <Link
            href="/billing/payments"
            className="px-3 py-2 text-sm font-semibold text-text-primary border-b-2 border-brand"
          >
            <Banknote size={14} className="inline mr-1" />
            Payments
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Payments shown
            </div>
            <div className="text-2xl font-semibold text-text-primary tabular mt-2">
              {rows.length}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Collected
            </div>
            <div className="text-2xl font-semibold text-success-dark tabular mt-2">
              {formatINR(collected)}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Pending
            </div>
            <div className="text-2xl font-semibold text-warning-dark tabular mt-2">
              {formatINR(pendingAmt)}
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 gap-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                All payments
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {source === 'mock' && 'Showing demo data — backend unreachable.'}
                {source === 'live' && 'Live data from your backend.'}
              </p>
            </div>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as ModeFilter)}
              className="input"
            >
              <option value="ALL">All modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="NETBANKING">Net banking</option>
              <option value="WALLET">Wallet</option>
            </select>
          </div>
          <div className="overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="text-text-secondary tabular">
                      {new Date(p.paidAt ?? p.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <Link
                        href={`/customers/${p.customerId}`}
                        className="text-brand hover:underline inline-flex items-center gap-1"
                      >
                        Open
                        <ExternalLink size={11} />
                      </Link>
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
                    <td className="text-xs text-text-muted truncate max-w-xs">
                      {p.reference ?? '—'}
                    </td>
                    <td className="tabular font-semibold">
                      {formatINR(Number(p.amount))}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-text-muted"
                    >
                      No payments recorded yet.
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
