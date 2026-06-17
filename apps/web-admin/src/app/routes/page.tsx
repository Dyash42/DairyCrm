'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Upload, Plus, ChevronRight } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { ExecutiveSelect } from '@/components/routes/ExecutiveSelect';
import { CompletionMini } from '@/components/routes/CompletionMini';
import { routes as mockRoutes, executives as mockExecutives } from '@/lib/mock-data';
import {
  fetchRoutes,
  fetchExecutives,
  assignRouteExecutive,
  createRoute,
  ApiError,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import type { Route as DomainRoute } from '@jharanai/shared';

export default function RoutesPage() {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const { data: routes, reload } = useApiWithFallback(
    fetchRoutes,
    (raw): DomainRoute[] =>
      raw.routes.map((r) => ({
        id: r.id,
        name: r.name,
        area: r.area,
        pinCodes: r.pinCodes,
        executiveId: r.executive?.id,
        customerCount: r.customerCount,
        todayCompletion: undefined,
      })),
    mockRoutes,
  );

  // Real executives for the assignment dropdown (was hardcoded mock data).
  const { data: execs, reload: reloadExecs } = useApiWithFallback(
    fetchExecutives,
    (raw): { id: string; name: string }[] =>
      raw.executives.map((e) => ({ id: e.id, name: e.name })),
    mockExecutives.map((e) => ({ id: e.id, name: e.name })),
  );

  async function handleAssign(routeId: string, executiveId: string) {
    try {
      await assignRouteExecutive(routeId, executiveId || null);
      reload();
      reloadExecs();
    } catch {
      // Backend unreachable (demo mode) — the selection simply won't persist.
    }
  }

  const totalCustomers = routes.reduce((sum, r) => sum + r.customerCount, 0);

  return (
    <>
      <Topbar
        title="Route management"
        subtitle="Assign customers and sales executives to routes"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              {routes.length} routes
            </span>{' '}
            · {totalCustomers} customers assigned
          </div>
          <div className="flex items-center gap-2">
            <Link href="/customers/import" className="btn-secondary">
              <Upload size={16} />
              Bulk upload
            </Link>
            <button onClick={() => setAddOpen(true)} className="btn-primary">
              <Plus size={16} />
              New route
            </button>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Area / PIN</th>
                <th>Sales executive</th>
                <th>Customers</th>
                <th>Completion</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/routes/${r.id}`)}
                  className="cursor-pointer"
                >
                  <td>
                    <div className="font-semibold text-text-primary">
                      {r.name}
                    </div>
                  </td>
                  <td>
                    <div className="text-text-primary">{r.area}</div>
                    <div className="text-xs text-text-muted">
                      {r.pinCodes.join(', ')}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ExecutiveSelect
                      executives={execs}
                      selectedId={r.executiveId}
                      onChange={(id) => handleAssign(r.id, id)}
                    />
                  </td>
                  <td>
                    <span className="tabular font-semibold text-text-primary">
                      {r.customerCount}
                    </span>
                  </td>
                  <td>
                    <CompletionMini pct={r.todayCompletion} />
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
        <AddRouteModal
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            reload();
            router.push(`/routes/${id}`);
          }}
        />
      )}
    </>
  );
}

function AddRouteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    area: '',
    pinCodes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const pinCodes = form.pinCodes
        .split(/[,\s]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const created = await createRoute({
        name: form.name,
        area: form.area,
        pinCodes,
      });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create route');
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
            Create route
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Name <span className="text-danger">*</span>
          </span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Route 5"
            className="input w-full mt-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Area <span className="text-danger">*</span>
          </span>
          <input
            required
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            placeholder="Berhampur South"
            className="input w-full mt-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            PIN codes
          </span>
          <input
            value={form.pinCodes}
            onChange={(e) => setForm((f) => ({ ...f, pinCodes: e.target.value }))}
            placeholder="760001, 760002"
            className="input w-full mt-1.5 tabular"
          />
          <span className="text-xs text-text-muted mt-1 block">
            Comma- or space-separated. Optional but recommended.
          </span>
        </label>

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
            {submitting ? 'Creating…' : 'Create route'}
          </button>
        </div>
      </form>
    </div>
  );
}
