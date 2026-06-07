'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Download, ChevronRight, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { SegmentedTabs } from '@/components/ui/Tabs';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import {
  customers as mockCustomers,
  getInitials,
  getRouteName,
} from '@/lib/mock-data';
import { fetchCustomers, fetchRoutes, createCustomer, ApiError } from '@/lib/api';
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
  const [addOpen, setAddOpen] = useState(false);

  const { data: customers } = useApiWithFallback(
    () =>
      fetchCustomers({
        q: query || undefined,
        status: filter === 'ALL' ? undefined : filter,
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
    [query, filter],
  );

  const rows = useMemo(() => {
    // The server already filters; this re-filter handles the mock-data path
    // (server is unreachable → we apply filter client-side).
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter !== 'ALL' && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.addressLine1?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [customers, filter, query]);

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
            <button className="btn-secondary">
              <Download size={16} />
              Export
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

interface AddForm {
  name: string;
  phone: string;
  addressLine1: string;
  email: string;
  altPhone: string;
  area: string;
  pinCode: string;
  routeId: string;
  litresPerDay: string;
}

function AddCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [routes, setRoutes] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState<AddForm>({
    name: '',
    phone: '',
    addressLine1: '',
    email: '',
    altPhone: '',
    area: '',
    pinCode: '',
    routeId: '',
    litresPerDay: '1',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes()
      .then((r) => setRoutes(r.routes.map((rr) => ({ id: rr.id, name: rr.name }))))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCustomer({
        name: form.name,
        phone: form.phone,
        addressLine1: form.addressLine1,
        email: form.email || undefined,
        altPhone: form.altPhone || undefined,
        area: form.area || undefined,
        pinCode: form.pinCode || undefined,
        routeId: form.routeId || undefined,
        litresPerDay: Number(form.litresPerDay),
      });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="bg-surface rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Add customer</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ModalField label="Name" required>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input w-full"
            />
          </ModalField>
          <ModalField label="Phone" required>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="input w-full tabular"
              placeholder="+91 9XXXXXXXXX"
            />
          </ModalField>
          <ModalField label="Address" required>
            <input
              required
              value={form.addressLine1}
              onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
              className="input w-full"
            />
          </ModalField>
          <ModalField label="Route">
            <select
              value={form.routeId}
              onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}
              className="input w-full"
            >
              <option value="">— pick a route —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </ModalField>
          <ModalField label="Litres / day" required>
            <input
              required
              type="number"
              step="0.5"
              value={form.litresPerDay}
              onChange={(e) => setForm((f) => ({ ...f, litresPerDay: e.target.value }))}
              className="input w-full tabular"
            />
          </ModalField>
          <ModalField label="Area">
            <input
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              className="input w-full"
            />
          </ModalField>
          <ModalField label="PIN code">
            <input
              value={form.pinCode}
              onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value }))}
              className="input w-full tabular"
            />
          </ModalField>
          <ModalField label="Email (optional)">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input w-full"
            />
          </ModalField>
        </div>

        {error && (
          <div className="bg-danger-light text-danger-dark text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create customer'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModalField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
