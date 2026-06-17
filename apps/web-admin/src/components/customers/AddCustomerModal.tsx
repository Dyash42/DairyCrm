'use client';

import { useEffect, useState } from 'react';
import { fetchRoutes, createCustomer, ApiError } from '@/lib/api';

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

/**
 * Shared "Add customer" modal. Used from the Customers page (no route
 * pre-selected) and from a Route's page (pre-selected + locked to that
 * route) — one form, one create path, so the two stay in sync.
 */
export function AddCustomerModal({
  onClose,
  onCreated,
  defaultRouteId,
  lockRoute,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Pre-select this route — e.g. when opened from a route's page. */
  defaultRouteId?: string;
  /** When true the route can't be changed, keeping the add scoped to one route. */
  lockRoute?: boolean;
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
    routeId: defaultRouteId ?? '',
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
              disabled={lockRoute}
              className="input w-full disabled:opacity-60 disabled:cursor-not-allowed"
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
