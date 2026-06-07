'use client';

import { useMemo, useState } from 'react';
import {
  Send,
  Megaphone,
  CalendarClock,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import {
  broadcasts as mockBroadcasts,
  routes,
  type BroadcastStatus,
} from '@/lib/mock-data';
import { fetchBroadcasts, createBroadcast, sendBroadcast } from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { cn } from '@/lib/cn';

const STATUS_TONE: Record<BroadcastStatus, PillTone> = {
  DRAFT: 'muted',
  SCHEDULED: 'info',
  SENDING: 'warning',
  SENT: 'success',
  FAILED: 'danger',
};

type TargetMode = 'ALL' | 'ROUTES';

export default function BroadcastsPage() {
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<TargetMode>('ROUTES');
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(['r1', 'r4']);
  const [submitting, setSubmitting] = useState(false);

  const { data: broadcasts, reload } = useApiWithFallback(
    fetchBroadcasts,
    (raw) =>
      raw.broadcasts.map((b) => ({
        id: b.id,
        message: b.message,
        target: b.target,
        routeIds: b.routes.map((r) => r.routeId),
        sentAt: b.status === 'SENT' ? b.createdAt : undefined,
        scheduledFor: b.scheduledFor ?? undefined,
        status: b.status as BroadcastStatus,
        sentCount: b.sentCount,
        deliveredCount: b.deliveredCount,
        failedCount: b.failedCount,
      })),
    mockBroadcasts,
  );

  async function onSendNow() {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const created = await createBroadcast({
        message,
        target: target === 'ROUTES' ? 'ROUTES' : 'ALL',
        routeIds: target === 'ROUTES' ? selectedRoutes : undefined,
      });
      await sendBroadcast(created.id);
      setMessage('');
      reload();
    } catch {
      // surfaced via the error pill in the live banner (TODO)
    } finally {
      setSubmitting(false);
    }
  }

  const recipientCount = useMemo(() => {
    if (target === 'ALL') {
      return routes.reduce((sum, r) => sum + r.customerCount, 0);
    }
    return routes
      .filter((r) => selectedRoutes.includes(r.id))
      .reduce((sum, r) => sum + r.customerCount, 0);
  }, [target, selectedRoutes]);

  const charCount = message.length;
  const estCost = (recipientCount * 0.115).toFixed(2);

  function toggleRoute(id: string) {
    setSelectedRoutes((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  return (
    <>
      <Topbar
        title="Broadcasts"
        subtitle="Send WhatsApp updates to a route, multiple routes, or everyone"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        {/* Composer */}
        <Card>
          <CardHeader
            title="New broadcast"
            subtitle="Goes out as a WhatsApp utility message — pre-approved template"
            action={
              <span className="pill-info text-xs">
                <Megaphone size={12} className="inline mr-1 -mt-0.5" />
                Template · broadcast_route_update
              </span>
            }
          />
          <CardBody className="space-y-5">
            {/* Target */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
                Send to
              </label>
              <div className="flex gap-2">
                <TargetChip
                  active={target === 'ROUTES'}
                  onClick={() => setTarget('ROUTES')}
                  label="Specific routes"
                />
                <TargetChip
                  active={target === 'ALL'}
                  onClick={() => setTarget('ALL')}
                  label="All customers"
                />
              </div>
            </div>

            {/* Route picker */}
            {target === 'ROUTES' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
                  Routes
                </label>
                <div className="flex flex-wrap gap-2">
                  {routes.map((r) => {
                    const selected = selectedRoutes.includes(r.id);
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => toggleRoute(r.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 h-9 rounded-lg border text-sm font-medium transition-colors',
                          selected
                            ? 'bg-brand text-white border-brand'
                            : 'bg-surface text-text-primary border-border hover:bg-surface-muted',
                        )}
                      >
                        <span>{r.name}</span>
                        <span
                          className={cn(
                            'text-xs tabular',
                            selected ? 'text-white/70' : 'text-text-muted',
                          )}
                        >
                          {r.customerCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Message body */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Heads up — heavy rain forecast tomorrow morning. Deliveries may be delayed by 30 mins."
                className="input w-full p-3 resize-none"
                maxLength={1024}
              />
              <div className="flex items-center justify-between mt-1.5 text-xs text-text-muted">
                <span>
                  Rendered with the{' '}
                  <code className="bg-surface-muted px-1.5 py-0.5 rounded text-[11px]">
                    broadcast_route_update
                  </code>{' '}
                  template
                </span>
                <span className="tabular">{charCount} / 1024</span>
              </div>
            </div>

            {/* Summary footer */}
            <div className="flex items-center justify-between pt-3 border-t border-divider">
              <div className="text-sm">
                <div className="text-text-primary font-semibold">
                  Reaching <span className="tabular">{recipientCount}</span>{' '}
                  customer{recipientCount === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-text-muted">
                  Estimated cost ≈ ₹{estCost} (₹0.115 per message, outside
                  service window)
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary">
                  <CalendarClock size={16} />
                  Schedule
                </button>
                <button
                  disabled={!message.trim() || recipientCount === 0 || submitting}
                  onClick={onSendNow}
                  className="btn-primary disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {submitting ? 'Sending…' : 'Send now'}
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* History */}
        <Card>
          <CardHeader
            title="Recent broadcasts"
            subtitle={`${broadcasts.length} in the last 30 days`}
          />
          <div className="overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Delivered</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id} className="cursor-pointer">
                    <td className="max-w-md">
                      <div className="text-text-primary line-clamp-2">
                        {b.message}
                      </div>
                      <div className="text-xs text-text-muted mt-1">
                        {b.sentAt
                          ? new Date(b.sentAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : b.scheduledFor
                            ? `Scheduled for ${new Date(
                                b.scheduledFor,
                              ).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}`
                            : 'Draft'}
                      </div>
                    </td>
                    <td>
                      {b.target === 'ALL'
                        ? 'All customers'
                        : b.target === 'ROUTES'
                          ? `${b.routeIds?.length ?? 0} routes`
                          : `${b.target}`}
                    </td>
                    <td>
                      <StatusPill tone={STATUS_TONE[b.status]}>
                        {b.status}
                      </StatusPill>
                    </td>
                    <td>
                      {b.status === 'SENT' ? (
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1 text-success-dark tabular">
                            <CheckCircle2 size={14} />
                            {b.deliveredCount}
                          </span>
                          {b.failedCount > 0 && (
                            <span className="flex items-center gap-1 text-danger tabular">
                              <XCircle size={14} />
                              {b.failedCount}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <ChevronRight size={16} className="text-text-muted" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function TargetChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 h-9 rounded-lg border text-sm font-medium transition-colors',
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-surface text-text-primary border-border hover:bg-surface-muted',
      )}
    >
      {label}
    </button>
  );
}
