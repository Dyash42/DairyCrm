'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Droplet, Users, IndianRupee, CheckCircle2 } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { SegmentedTabs } from '@/components/ui/Tabs';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { HourlyDeliveryChart } from '@/components/dashboard/HourlyDeliveryChart';
import { BreakdownList } from '@/components/dashboard/BreakdownList';
import { RouteVolumeBars } from '@/components/dashboard/RouteVolumeBars';
import { SubscriptionsDonut } from '@/components/dashboard/SubscriptionsDonut';
import { RouteCompletionBars } from '@/components/dashboard/RouteCompletionBars';
import { dashboardMetrics } from '@/lib/mock-data';
import {
  fetchDashboardMetrics,
  fetchRoutes,
  fetchSuccessMetrics,
  fetchByRoute,
  fetchByCustomer,
  type SuccessMetrics,
  type ByRouteRow,
  type ByCustomerRow,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR } from '@jharanai/shared';

type Range = 'TODAY' | 'WEEK' | 'MONTH';

// Demo fallback so the §9 card renders without a backend (Path A demo).
const MOCK_SUCCESS_METRICS: SuccessMetrics = {
  onboardingCompletion: { rate: 88, completed: 412, pendingLeads: 56, targetPct: 85 },
  deliveryConfirmation: { rate: 97, delivered: 11640, scheduled: 12000, windowDays: 30, targetPct: 98 },
  renewal: { rate: 82, renewed: 180, lapsed: 39, targetPct: 80 },
  totalCustomers: 468,
};

/**
 * Format today's date the way the dashboard topbar expects. The
 * previous hardcoded `'Mon, 2 Jun 2026'` made every demo + production
 * deploy look stale (and was the literal design date).
 */
function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [range, setRange] = useState<Range>('TODAY');
  const { data: m, source } = useApiWithFallback(
    () => fetchDashboardMetrics(range),
    (raw) => raw,
    dashboardMetrics,
    [range],
  );

  // Route completion sorted best→worst, only those with data
  const routeCompletion = [...m.byRoute]
    .filter((r) => r.completionPct > 0)
    .sort((a, b) => b.completionPct - a.completionPct)
    .map((r) => ({ routeName: r.routeName, pct: r.completionPct }));

  // The "no executive assigned" alert must reflect REAL assignment, not a 0%
  // completion (which just means deliveries haven't started yet) — audit WEB-07.
  const { data: routes } = useApiWithFallback(
    fetchRoutes,
    (raw) => raw.routes.map((r) => ({ name: r.name, hasExec: r.executive != null })),
    [] as { name: string; hasExec: boolean }[],
    [],
  );
  const unassignedRoute = routes.find((r) => !r.hasExec);

  // PRD §9 success metrics + §7.4 by-route + §7.5 by-customer analytics.
  const { data: metrics } = useApiWithFallback(
    fetchSuccessMetrics,
    (raw) => raw,
    MOCK_SUCCESS_METRICS,
    [],
  );
  const { data: byRoute } = useApiWithFallback(
    () => fetchByRoute(range),
    (raw) => raw.routes,
    [] as ByRouteRow[],
    [range],
  );
  const { data: byCustomer } = useApiWithFallback(
    () => fetchByCustomer(range),
    (raw) => raw.customers,
    [] as ByCustomerRow[],
    [range],
  );

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Operational overview — Berhampur cluster"
      />

      <div className="px-8 py-6 space-y-6 flex-1 overflow-y-auto">
        {/* Range tabs + date */}
        <div className="flex items-center justify-between">
          <SegmentedTabs<Range>
            tabs={[
              { value: 'TODAY', label: 'Today' },
              { value: 'WEEK', label: 'This week' },
              { value: 'MONTH', label: 'This month' },
            ]}
            value={range}
            onChange={setRange}
          />
          <div className="text-sm text-text-secondary flex items-center gap-2">
            {source === 'mock' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning-light text-warning-dark">
                demo data
              </span>
            )}
            {source === 'live' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success-light text-success-dark">
                live
              </span>
            )}
            <span>{todayLabel()}</span>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            icon={Droplet}
            label="Litres delivered"
            value={m.litresDelivered.toString()}
            unit="L"
            deltaPct={m.litresDeltaPct}
            iconBgClass="bg-info-light"
            iconColorClass="text-info"
          />
          <KpiCard
            icon={Users}
            label="Customers served"
            value={`${m.customersServed}`}
            unit={`/${m.customersScheduled}`}
            deltaPct={m.customersDeltaPct}
            iconBgClass="bg-brand-50"
            iconColorClass="text-brand"
          />
          <KpiCard
            icon={IndianRupee}
            label="Revenue"
            value={formatINR(m.revenue).replace('₹', '₹')}
            deltaPct={m.revenueDeltaPct}
            iconBgClass="bg-success-light"
            iconColorClass="text-success-dark"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Completion"
            value={`${m.completionPct}`}
            unit="%"
            deltaPct={m.completionDeltaPct}
            iconBgClass="bg-warning-light"
            iconColorClass="text-warning-dark"
          />
        </div>

        {/* Morning chart + breakdown */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Litres delivered through the morning"
              subtitle="Today · in L"
            />
            <CardBody>
              <HourlyDeliveryChart data={m.hourlyDelivery} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Operational breakdown" />
            <CardBody>
              <BreakdownList
                items={[
                  {
                    label: 'Pending',
                    value: m.breakdown.pending,
                    dotClass: 'bg-warning',
                  },
                  {
                    label: 'Missed',
                    value: m.breakdown.missed,
                    dotClass: 'bg-danger',
                  },
                  {
                    label: 'Paused',
                    value: m.breakdown.paused,
                    dotClass: 'bg-text-muted',
                  },
                  {
                    label: 'New today',
                    value: m.breakdown.newToday,
                    dotClass: 'bg-success',
                  },
                  {
                    label: 'Unrouted (active)',
                    value: m.breakdown.unroutedActive ?? 0,
                    dotClass: 'bg-danger',
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        {/* Litres by route + subscriptions donut */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Litres by route"
              subtitle="Volume delivered across routes"
            />
            <CardBody>
              <RouteVolumeBars
                routes={m.byRoute.map((r) => ({
                  routeName: r.routeName,
                  litres: r.litres,
                }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Subscriptions"
              subtitle={`${m.subscriptions.total} total accounts`}
            />
            <CardBody>
              <SubscriptionsDonut data={m.subscriptions} />
            </CardBody>
          </Card>
        </div>

        {/* Route completion + alert */}
        <Card>
          <CardHeader
            title="Route completion"
            subtitle="Delivery completion % — best to worst today"
          />
          <CardBody className="space-y-4">
            <RouteCompletionBars routes={routeCompletion} />
            {unassignedRoute && (
              <AlertBanner
                tone="danger"
                message={
                  <>
                    <strong className="font-semibold">
                      {unassignedRoute.name}
                    </strong>{' '}
                    has no executive assigned.
                  </>
                }
                cta="Assign now"
                onCtaClick={() => router.push('/routes')}
              />
            )}
            {(m.breakdown.unroutedActive ?? 0) > 0 && (
              <AlertBanner
                tone="danger"
                message={
                  <>
                    <strong className="font-semibold">
                      {m.breakdown.unroutedActive}
                    </strong>{' '}
                    active{' '}
                    {(m.breakdown.unroutedActive ?? 0) === 1
                      ? 'customer has'
                      : 'customers have'}{' '}
                    no route — they are not being delivered or billed (EDG-04).
                  </>
                }
                cta="Assign routes"
                onCtaClick={() => router.push('/customers?unrouted=true')}
              />
            )}
          </CardBody>
        </Card>

        {/* PRD §9 — success metrics vs targets */}
        <Card>
          <CardHeader title="Success metrics" subtitle="Live rates against PRD targets" />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricTile
                label="Onboarding completion"
                pct={metrics.onboardingCompletion.rate}
                target={metrics.onboardingCompletion.targetPct}
                sub={`${metrics.onboardingCompletion.completed} activated · ${metrics.onboardingCompletion.pendingLeads} leads`}
              />
              <MetricTile
                label="Delivery confirmation"
                pct={metrics.deliveryConfirmation.rate}
                target={metrics.deliveryConfirmation.targetPct}
                sub={`${metrics.deliveryConfirmation.delivered}/${metrics.deliveryConfirmation.scheduled} · last ${metrics.deliveryConfirmation.windowDays}d`}
              />
              <MetricTile
                label="Renewal rate"
                pct={metrics.renewal.rate}
                target={metrics.renewal.targetPct}
                sub={`${metrics.renewal.renewed} renewed · ${metrics.renewal.lapsed} lapsed`}
              />
            </div>
          </CardBody>
        </Card>

        {/* PRD §7.4 — by route: executive performance */}
        <Card>
          <CardHeader
            title="By route — executive performance"
            subtitle="Completion %, litres, customer count"
          />
          <CardBody>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Executive</th>
                  <th>Customers</th>
                  <th>Completion</th>
                  <th>Litres</th>
                </tr>
              </thead>
              <tbody>
                {byRoute.map((r) => (
                  <tr key={r.routeId}>
                    <td className="font-medium text-text-primary">{r.routeName}</td>
                    <td className={r.executive ? '' : 'text-danger-dark'}>
                      {r.executive ?? 'Unassigned'}
                    </td>
                    <td className="tabular">{r.customerCount}</td>
                    <td className="tabular">
                      {r.scheduled > 0
                        ? `${r.completionPct}% (${r.delivered}/${r.scheduled})`
                        : '—'}
                    </td>
                    <td className="tabular">{r.litres} L</td>
                  </tr>
                ))}
                {byRoute.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-muted">
                      No route data for this range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>

        {/* PRD §7.5 — by customer: value, adherence, payment */}
        <Card>
          <CardHeader
            title="By customer — value & adherence"
            subtitle={`Subscription value, delivery adherence, balance · first ${byCustomer.length}`}
          />
          <CardBody>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Route</th>
                  <th>Monthly value</th>
                  <th>Adherence</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {byCustomer.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium text-text-primary">{c.name}</div>
                      <div className="text-xs text-text-muted">{c.code}</div>
                    </td>
                    <td>{c.routeName ?? '—'}</td>
                    <td className="tabular">{formatINR(c.monthlyValue)}</td>
                    <td className="tabular">
                      {c.adherencePct == null
                        ? '—'
                        : `${c.adherencePct}% (${c.delivered}/${c.scheduled})`}
                    </td>
                    <td className="tabular">
                      {c.outstanding > 0 ? (
                        <span className="text-danger-dark">{formatINR(c.outstanding)}</span>
                      ) : c.outstanding < 0 ? (
                        formatINR(c.outstanding)
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {byCustomer.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-muted">
                      No customer data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function MetricTile({
  label,
  pct,
  target,
  sub,
}: {
  label: string;
  pct: number;
  target: number;
  sub: string;
}) {
  const ok = pct >= target;
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${ok ? 'text-success-dark' : 'text-warning-dark'}`}>
          {pct}%
        </span>
        <span className="text-xs text-text-muted">target {target}%</span>
      </div>
      <div className="text-xs text-text-muted mt-1">{sub}</div>
    </div>
  );
}
