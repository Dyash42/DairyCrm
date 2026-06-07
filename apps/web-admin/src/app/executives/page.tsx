'use client';

import { Plus, ChevronRight, Phone } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { executives as mockExecs, routes, getInitials } from '@/lib/mock-data';
import { fetchExecutives } from '@/lib/api';
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
  const { data: executives } = useApiWithFallback(
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
          <button className="btn-primary">
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
                <tr key={e.id} className="cursor-pointer">
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar initials={getInitials(e.name)} />
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary">
                          {e.name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {e.id.toUpperCase()}
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
    </>
  );
}
