'use client';

import { Download, ChevronRight, Banknote, Smartphone, CreditCard } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { invoices } from '@/lib/mock-data';
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
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const collected = invoices
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.amount, 0);
  const pending = total - collected;

  return (
    <>
      <Topbar
        title="Billing"
        subtitle="Monthly invoices and payment status"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Billed (May 2026)
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
                Invoices · May 2026
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {invoices.length} customers · current cycle
              </p>
            </div>
            <button className="btn-secondary">
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
