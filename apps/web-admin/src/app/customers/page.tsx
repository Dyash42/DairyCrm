'use client';

import { useMemo, useState } from 'react';
import { Search, Download, ChevronRight, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { SegmentedTabs } from '@/components/ui/Tabs';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import {
  customers as mockCustomers,
  getInitials,
  getRouteName,
} from '@/lib/mock-data';
import {
  fetchCustomers,
  downloadCustomersCsv,
  ApiError,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import {
  formatINR,
  formatLitres,
  type Customer,
  type CustomerStatus,
} from '@jharanai/shared';

type Filter = 'ALL' | CustomerStatus;

const TONE: Record<CustomerStatus, PillTone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  CANCELLED: 'danger',
};

const LABEL: Record<CustomerStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  CANCELLED: 'Cancelled',
};

export default function CustomersPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadCustomersCsv(`jharanai-customers-${today}.csv`);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const { data: customers } = useApiWithFallback(
    () =>
      fetchCustomers({
        q: query || undefined,
        status: filter === 'ALL' ? undefined : filter,
        area: area || undefined,
        limit: 100,
      }),
    (raw): Customer[] =>
      raw.customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        addressLine1: c.addressLine1,
        routeId: c.routeId ?? undefined,
        status: c.status,
        litresPerDay: Number(c.litresPerDay),
        balance: Number(c.balance),
        createdAt: '',
        updatedAt: '',
      })),
    mockCustomers,
    [query, filter, area],
  );

  const rows = useMemo(() => {
    // The server already filters; this re-filter handles the mock-data path
    // (server is unreachable → we apply filter client-side).
    const q = query.trim().toLowerCase();
    const a = area.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter !== 'ALL' && c.status !== filter) return false;
      if (a && !(c.addressLine1?.toLowerCase().includes(a) ?? false)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.addressLine1?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [customers, filter, query, area]);

  return (
    <>
      <Topbar title="Customers" subtitle="Subscriptions, status and billing" />

      <div className="px-8 py-6 flex-1 overflow-y-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5 gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1 max-w-sm">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, ID, area…"
                className="input pl-9 w-full"
              />
            </div>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Filter by area…"
              className="input w-40"
            />
            <SegmentedTabs<Filter>
              tabs={[
                { value: 'ALL', label: 'All' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'PAUSED', label: 'Paused' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          <div className="flex gap-2">
            <Link href="/customers/import" className="btn-secondary">
              <Upload size={16} />
              Import CSV
            </Link>
            <button onClick={() => setAddOpen(true)} className="btn-primary">
              <Plus size={16} />
              Add customer
            </button>
            <button
              onClick={onExport}
              disabled={exporting}
              className="btn-secondary disabled:opacity-50"
            >
              <Download size={16} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Route / Area</th>
                <th>Litres/day</th>
                <th>Status</th>
                <th>Balance</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className="cursor-pointer">
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar initials={getInitials(c.name)} />
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary truncate">
                          {c.name}
                        </div>
                        <div className="text-xs text-text-muted">{c.code}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="text-text-primary">
                      {getRouteName(c.routeId) ?? '—'}
                    </div>
                    <div className="text-xs text-text-muted">
                      {c.addressLine1}
                    </div>
                  </td>
                  <td>
                    <span className="tabular font-semibold text-text-primary">
                      {formatLitres(c.litresPerDay)}
                    </span>
                  </td>
                  <td>
                    <StatusPill tone={TONE[c.status]}>
                      {LABEL[c.status]}
                    </StatusPill>
                  </td>
                  <td>
                    {c.balance < 0 ? (
                      <StatusPill tone="danger">
                        {formatINR(c.balance)}
                      </StatusPill>
                    ) : c.balance > 0 ? (
                      <span className="tabular text-sm text-text-secondary">
                        {formatINR(c.balance)}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <ChevronRight size={16} className="text-text-muted" />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    No customers match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {addOpen && (
        <AddCustomerModal
          onClose={() => setAddOpen(false)}
          onCreated={(id) => router.push(`/customers/${id}`)}
        />
      )}
    </>
  );
}
