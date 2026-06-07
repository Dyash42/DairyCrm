'use client';

import { useEffect, useState } from 'react';
import { Plus, ChevronRight, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { executives as mockExecs, routes, getInitials } from '@/lib/mock-data';
import {
  fetchExecutives,
  fetchRoutes,
  createExecutive,
  ApiError,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';

interface ExecRow {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  routeId: string | null | undefined;
  routeName: string;
}

function routeOf(id?: string | null) {
  if (!id) return '—';
  return routes.find((r) => r.id === id)?.name ?? '—';
}

export default function ExecutivesPage() {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const { data: executives, reload } = useApiWithFallback(
    fetchExecutives,
    (raw): ExecRow[] =>
      raw.executives.map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        active: e.active,
        routeId: e.routeId,
        routeName: e.routeName ?? routeOf(e.routeId),
      })),
    mockExecs.map((e) => ({
      id: e.id,
      name: e.name,
      phone: e.phone,
      active: e.active,
      routeId: e.routeId ?? null,
      routeName: routeOf(e.routeId),
    })),
  );

  const totalAssigned = executives.filter((e) => e.routeId).length;

  return (
    <>
      <Topbar
        title="Sales executives"
        subtitle="Milkmen on the ground · assignments and contact"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              {executives.length} executives
            </span>{' '}
            · {totalAssigned} on active routes
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-primary">
            <Plus size={16} />
            Add executive
          </button>
        </div>

        <Card className="overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Executive</th>
                <th>Phone</th>
                <th>Assigned route</th>
                <th>Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {executives.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => router.push(`/executives/${e.id}`)}
                  className="cursor-pointer"
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar initials={getInitials(e.name)} />
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary">
                          {e.name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {e.id.slice(0, 8).toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 text-text-primary tabular">
                      <Phone size={13} className="text-text-muted" />
                      {e.phone}
                    </div>
                  </td>
                  <td>
                    <span className="text-text-primary">{e.routeName}</span>
                  </td>
                  <td>
                    <StatusPill tone={e.active ? 'success' : 'muted'}>
                      {e.active ? 'Active' : 'Inactive'}
                    </StatusPill>
                  </td>
                  <td>
                    <ChevronRight size={16} className="text-text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {addOpen && (
        <AddExecutiveModal
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            reload();
            router.push(`/executives/${id}`);
          }}
        />
      )}
    </>
  );
}

interface AddForm {
  name: string;
  phone: string;
  email: string;
  routeId: string;
}

function AddExecutiveModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [availableRoutes, setAvailableRoutes] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [form, setForm] = useState<AddForm>({
    name: '',
    phone: '',
    email: '',
    routeId: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes()
      .then((r) =>
        setAvailableRoutes(r.routes.map((rr) => ({ id: rr.id, name: rr.name }))),
      )
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createExecutive({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        routeId: form.routeId || undefined,
      });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create executive');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            Add executive
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        <Field label="Name" required>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input w-full"
          />
        </Field>
        <Field label="Phone" required>
          <input
            required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="input w-full tabular"
            placeholder="+91 9XXXXXXXXX"
          />
        </Field>
        <Field label="Email (optional)">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="input w-full"
          />
        </Field>
        <Field label="Assigned route">
          <select
            value={form.routeId}
            onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}
            className="input w-full"
          >
            <option value="">— no route yet —</option>
            {availableRoutes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>

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
            {submitting ? 'Creating…' : 'Create executive'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
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
