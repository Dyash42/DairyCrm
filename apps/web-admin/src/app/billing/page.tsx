'use client';

import Link from 'next/link';
import { Download, ChevronRight, Banknote, Smartphone, CreditCard, Receipt } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { invoices as mockInvoices } from '@/lib/mock-data';
import { fetchInvoices } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR } from '@jharanai/shared';

function PaidViaIcon({ via }: { via?: 'CASH' | 'UPI_STATIC' | 'UPI_ONLINE' }) {
  if (via === 'CASH')
    return <Banknote size={14} className="text-text-secondary" />;
  if (via === 'UPI_STATIC')
    return <Smartphone size={14} className="text-text-secondary" />;
  if (via === 'UPI_ONLINE')
    return <CreditCard size={14} className="text-text-secondary" />;
  return null;
}

const VIA_LABEL = {
  CASH: 'Cash',
  UPI_STATIC: 'UPI (QR)',
  UPI_ONLINE: 'UPI (online)',
} as const;

export default function BillingPage() {
  const { data: invoices } = useApiWithFallback(
    () => fetchInvoices(),
    (raw) =>
      raw.invoices.map((i) => ({
        id: i.id,
        customerName: i.customerName,
        customerCode: i.customerCode,
        routeName: i.routeName,
        period: i.period,
        litres: i.litres,
        amount: i.amount,
        paid: i.paid,
        paidVia: (i.paidVia as 'CASH' | 'UPI_STATIC' | 'UPI_ONLINE' | null) ?? undefined,
      })),
    mockInvoices,
  );

  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const collected = invoices
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.amount, 0);
  const pending = total - collected;

  // The backend returns the current billing cycle; label it from the actual
  // period instead of a hardcoded "May 2026" (audit WEB-10).
  const periodLabel = new Date().toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  // Client-side CSV export from the loaded invoices — the button was dead
  // before (no handler, no endpoint) (audit WEB-11).
  const exportCsv = () => {
    const header = ['Customer', 'Code', 'Route', 'Period', 'Litres', 'Amount', 'Paid', 'Paid via'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = invoices.map((i) =>
      [i.customerName, i.customerCode, i.routeName, i.period, i.litres, i.amount, i.paid ? 'Yes' : 'No', i.paidVia ?? '']
        .map(esc)
        .join(','),
    );
    const csv = [header.map(esc).join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `jharanai-invoices-${periodLabel.replace(/\s/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Topbar
        title="Billing"
        subtitle="Monthly invoices and payment status"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        {/* Tab nav */}
        <div className="flex items-center gap-4 border-b border-divider">
          <Link
            href="/billing"
            className="px-3 py-2 text-sm font-semibold text-text-primary border-b-2 border-brand"
          >
            <Receipt size={14} className="inline mr-1" />
            Invoices
          </Link>
          <Link
            href="/billing/payments"
            className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <Banknote size={14} className="inline mr-1" />
            Payments
          </Link>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Billed ({periodLabel})
            </div>
            <div className="text-2xl font-semibold text-text-primary tabular mt-2">
              {formatINR(total)}
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
              Outstanding
            </div>
            <div className="text-2xl font-semibold text-danger tabular mt-2">
              {formatINR(pending)}
            </div>
          </Card>
        </div>

        {/* Invoices */}
        <Card>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Invoices · {periodLabel}
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {invoices.length} customers · current cycle
              </p>
            </div>
            <button className="btn-secondary" onClick={exportCsv}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
          <div className="overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Route</th>
                  <th>Litres</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid via</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="cursor-pointer">
                    <td>
                      <div className="font-semibold text-text-primary">
                        {i.customerName}
                      </div>
                      <div className="text-xs text-text-muted">{i.customerCode}</div>
                    </td>
                    <td>{i.routeName}</td>
                    <td>
                      <span className="tabular text-text-primary font-semibold">
                        {i.litres} L
                      </span>
                    </td>
                    <td>
                      <span className="tabular text-text-primary font-semibold">
                        {formatINR(i.amount)}
                      </span>
                    </td>
                    <td>
                      {i.paid ? (
                        <StatusPill tone="success">Paid</StatusPill>
                      ) : (
                        <StatusPill tone="danger">Pending</StatusPill>
                      )}
                    </td>
                    <td>
                      {i.paidVia ? (
                        <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                          <PaidViaIcon via={i.paidVia} />
                          {VIA_LABEL[i.paidVia]}
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <ChevronRight size={16} className="text-text-muted" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
