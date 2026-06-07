'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Phone,
  MapPin,
  UserCog,
  Users,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { fetchRouteDetail } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { getInitials } from '@/lib/mock-data';
import { formatLitres } from '@jharanai/shared';

const STATUS_TONE: Record<string, PillTone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  CANCELLED: 'danger',
};

export default function RouteDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const routeId = params.id;

  const { data: route, source } = useApiWithFallback(
    () => fetchRouteDetail(routeId),
    (raw) => raw,
    null as Awaited<ReturnType<typeof fetchRouteDetail>> | null,
    [routeId],
  );

  if (!route) {
    return (
      <>
        <Topbar title="Route" subtitle="Loading…" />
        <div className="px-8 py-6 text-text-secondary">
          {source === 'mock' ? 'Backend unreachable.' : 'Loading route detail…'}
        </div>
      </>
    );
  }

  const totalLitres = route.customers.reduce(
    (sum, c) => sum + Number(c.litresPerDay),
    0,
  );
  const activeCount = route.customers.filter((c) => c.status === 'ACTIVE').length;

  return (
    <>
      <Topbar
        title={route.name}
        subtitle={`${route.area} · ${route.pinCodes.join(', ')}`}
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        <div>
          <Link
            href="/routes"
            className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={14} className="mr-1" />
            All routes
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Customers
            </div>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-semibold tabular text-text-primary">
                {activeCount}
              </span>
              <span className="text-sm text-text-secondary">
                / {route.customers.length} total
              </span>
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Daily litres scheduled
            </div>
            <div className="text-2xl font-semibold tabular text-text-primary mt-2">
              {totalLitres.toFixed(1)} L
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-text-muted uppercase tracking-wide font-semibold">
              Sales executive
            </div>
            <div className="mt-2 text-text-primary text-base">
              {route.executive ? (
                <div className="flex items-center gap-2">
                  <UserCog size={16} className="text-text-secondary" />
                  <span className="font-semibold">{route.executive.user.name}</span>
                </div>
              ) : (
                <span className="text-danger-dark font-semibold">Unassigned</span>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Assigned customers"
            subtitle={`${route.customers.length} on this route`}
            action={
              <Link href="/customers/import" className="btn-secondary">
                Import more
              </Link>
            }
          />
          <CardBody className="p-0">
            {route.customers.length === 0 ? (
              <div className="py-12 text-center text-text-muted">
                No customers assigned. Use Import CSV or Add customer to start.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Litres/day</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {route.customers.map((c, i) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/customers/${c.id}`)}
                      className="cursor-pointer"
                    >
                      <td className="tabular text-text-muted">{c.routeSeq ?? i + 1}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar initials={getInitials(c.name)} size={32} />
                          <div className="min-w-0">
                            <div className="font-semibold text-text-primary truncate">
                              {c.name}
                            </div>
                            <div className="text-xs text-text-muted">{c.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-text-secondary">{c.addressLine1}</td>
                      <td className="tabular font-semibold">
                        {formatLitres(Number(c.litresPerDay))}
                      </td>
                      <td>
                        <StatusPill tone={STATUS_TONE[c.status] ?? 'muted'}>
                          {c.status}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
