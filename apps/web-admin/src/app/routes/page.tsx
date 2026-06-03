'use client';

import { Upload, Plus, ChevronRight } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { ExecutiveSelect } from '@/components/routes/ExecutiveSelect';
import { CompletionMini } from '@/components/routes/CompletionMini';
import { routes, executives } from '@/lib/mock-data';

export default function RoutesPage() {
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
            <button className="btn-secondary">
              <Upload size={16} />
              Bulk upload
            </button>
            <button className="btn-primary">
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
                <tr key={r.id} className="cursor-pointer">
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
                  <td>
                    <ExecutiveSelect
                      executives={executives}
                      selectedId={r.executiveId}
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
    </>
  );
}
