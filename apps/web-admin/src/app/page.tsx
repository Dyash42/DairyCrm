'use client';

import { useState } from 'react';
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
import { fetchDashboardMetrics } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR } from '@jharanai/shared';

type Range = 'TODAY' | 'WEEK' | 'MONTH';

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

  const unassignedRoute = m.byRoute.find((r) => r.completionPct === 0);

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
                      {unassignedRoute.routeName}
                    </strong>{' '}
                    has no executive assigned.
                  </>
                }
                cta="Assign now"
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
