'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Phone,
  MapPin,
  RefreshCw,
  Download,
  Pause,
  Play,
  XCircle,
  Banknote,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill, type PillTone } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { getInitials } from '@/lib/mock-data';
import {
  fetchCustomerDetail,
  fetchCustomerQr,
  regenerateCustomerQr,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  recordCashPayment,
  ApiError,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR, formatLitres } from '@jharanai/shared';

const STATUS_TONE: Record<string, PillTone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  CANCELLED: 'danger',
};

export default function CustomerDetailPage() {
  const params = useParams() as { id: string };
  const customerId = params.id;

  const { data: customer, source, reload: reloadDetail } = useApiWithFallback(
    () => fetchCustomerDetail(customerId),
    (raw) => raw,
    null as Awaited<ReturnType<typeof fetchCustomerDetail>> | null,
    [customerId],
  );

  const { data: qr, reload: reloadQr } = useApiWithFallback(
    () => fetchCustomerQr(customerId),
    (raw) => raw,
    null as { code: string; dataUrl: string } | null,
    [customerId],
  );

  const [regenerating, setRegenerating] = useState(false);
  const [pauseFor, setPauseFor] = useState<string | null>(null); // subscription id
  const [payOpen, setPayOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onResume(subId: string) {
    setActionError(null);
    try {
      await resumeSubscription(subId);
      reloadCustomer();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Resume failed');
    }
  }

  async function onCancelSub(subId: string) {
    const ok = window.confirm(
      'Cancel this subscription? Future deliveries will stop. This cannot be undone.',
    );
    if (!ok) return;
    setActionError(null);
    try {
      await cancelSubscription(subId);
      reloadCustomer();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Cancel failed');
    }
  }

  // Reload helper: useApiWithFallback's data lives in `customer` but we need
  // to refetch after mutations.
  // We trigger this by toggling a key/refetch. Since the hook doesn't expose
  // it here, the simplest path is window.location.reload(); the cleaner path
  // is using the hook's reload(). The hook does return reload — use it.
  function reloadCustomer() {
    // reload provided by the hook below
    reloadDetail();
  }

  async function onRegenerate() {
    const reason = window.prompt(
      'Why are you regenerating this QR? (visible in audit log)',
      'Customer reported lost QR',
    );
    if (reason === null) return;
    setRegenerating(true);
    try {
      await regenerateCustomerQr(customerId, reason || undefined);
      reloadQr();
    } finally {
      setRegenerating(false);
    }
  }

  if (!customer) {
    return (
      <>
        <Topbar title="Customer" subtitle="Loading…" />
        <div className="px-8 py-6 text-text-secondary">
          {source === 'mock' ? 'No data — backend unreachable.' : 'Loading customer detail…'}
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={customer.name}
        subtitle={`${customer.code} · ${customer.route?.name ?? 'No route'}`}
      />
      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={14} className="mr-1" />
            All customers
          </Link>
        </div>

        {/* Header */}
        <Card className="p-5 flex items-start gap-5">
          <Avatar initials={getInitials(customer.name)} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-text-primary">
                {customer.name}
              </h2>
              <StatusPill tone={STATUS_TONE[customer.status] ?? 'muted'}>
                {customer.status}
              </StatusPill>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <Phone size={13} /> {customer.phone}
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={13} /> {customer.addressLine1}
              </div>
              <div>
                <span className="text-text-muted">Code:</span>{' '}
                <span className="tabular font-medium text-text-primary">
                  {customer.code}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Litres/day:</span>{' '}
                <span className="tabular font-medium text-text-primary">
                  {formatLitres(Number(customer.litresPerDay))}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => setPayOpen(true)} className="btn-primary">
              <Banknote size={14} /> Record payment
            </button>
          </div>
        </Card>

        {actionError && (
          <div className="bg-danger-light text-danger-dark text-sm rounded-lg p-3">
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* QR card */}
          <Card>
            <CardHeader
              title="Customer QR"
              subtitle="Shown to the milkman at delivery"
              action={
                <button
                  onClick={onRegenerate}
                  disabled={regenerating}
                  className="btn-secondary disabled:opacity-50"
                >
                  <RefreshCw size={14} />
                  {regenerating ? 'Working…' : 'Regenerate'}
                </button>
              }
            />
            <CardBody className="flex flex-col items-center">
              {qr ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr.dataUrl}
                    alt={`QR for ${qr.code}`}
                    className="w-48 h-48 rounded-lg border border-border"
                  />
                  <a
                    href={qr.dataUrl}
                    download={`${qr.code}.png`}
                    className="mt-3 text-sm text-brand hover:text-brand-600 inline-flex items-center gap-1"
                  >
                    <Download size={13} /> Download PNG
                  </a>
                  <div className="mt-2 text-xs text-text-muted tabular">
                    {qr.code}
                  </div>
                </>
              ) : (
                <div className="text-sm text-text-muted py-8">
                  QR not available
                </div>
              )}
            </CardBody>
          </Card>

          {/* Subscription history */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Subscription history"
              subtitle={`${customer.subscriptions.length} total`}
            />
            <CardBody>
              {customer.subscriptions.length === 0 ? (
                <EmptyState message="No subscriptions yet" />
              ) : (
                <ul className="divide-y divide-divider">
                  {customer.subscriptions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <div className="font-medium text-text-primary">
                          {s.sku} · {Number(s.litresPerDay)} L/day
                        </div>
                        <div className="text-xs text-text-muted">
                          {new Date(s.startDate).toLocaleDateString()} →{' '}
                          {s.endDate
                            ? new Date(s.endDate).toLocaleDateString()
                            : 'ongoing'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular text-sm text-text-secondary">
                          ₹{Number(s.ratePerLitre)}/L
                        </span>
                        <StatusPill tone={STATUS_TONE[s.status] ?? 'muted'}>
                          {s.status}
                        </StatusPill>
                        {s.status === 'ACTIVE' && (
                          <>
                            <button
                              onClick={() => setPauseFor(s.id)}
                              className="btn-secondary py-1 px-2 text-xs"
                              title="Pause subscription"
                            >
                              <Pause size={12} /> Pause
                            </button>
                            <button
                              onClick={() => onCancelSub(s.id)}
                              className="btn-secondary py-1 px-2 text-xs text-danger-dark"
                              title="Cancel subscription"
                            >
                              <XCircle size={12} /> Cancel
                            </button>
                          </>
                        )}
                        {s.status === 'PAUSED' && (
                          <button
                            onClick={() => onResume(s.id)}
                            className="btn-secondary py-1 px-2 text-xs text-success-dark"
                            title="Resume subscription"
                          >
                            <Play size={12} /> Resume
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Payments history */}
        <Card>
          <CardHeader
            title="Payment history"
            subtitle={`Last ${customer.payments.length}`}
          />
          <CardBody>
            {customer.payments.length === 0 ? (
              <EmptyState message="No payments yet" />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="text-text-secondary">
                        {new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}
                      </td>
                      <td>{p.mode}</td>
                      <td>
                        <StatusPill
                          tone={
                            p.status === 'PAID'
                              ? 'success'
                              : p.status === 'FAILED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {p.status}
                        </StatusPill>
                      </td>
                      <td className="tabular font-semibold">
                        {formatINR(Number(p.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        {pauseFor && (
          <PauseModal
            subscriptionId={pauseFor}
            onClose={() => setPauseFor(null)}
            onDone={() => {
              setPauseFor(null);
              reloadDetail();
            }}
          />
        )}
        {payOpen && (
          <RecordPaymentModal
            customerId={customerId}
            onClose={() => setPayOpen(false)}
            onDone={() => {
              setPayOpen(false);
              reloadDetail();
            }}
          />
        )}

        {/* Pause history */}
        <Card>
          <CardHeader
            title="Pause history"
            subtitle={`${customer.pauses.length} pauses`}
          />
          <CardBody>
            {customer.pauses.length === 0 ? (
              <EmptyState message="No pauses recorded" />
            ) : (
              <ul className="divide-y divide-divider">
                {customer.pauses.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium text-text-primary tabular">
                        {new Date(p.startDate).toLocaleDateString()} →{' '}
                        {new Date(p.endDate).toLocaleDateString()}
                      </div>
                      {p.reason && (
                        <div className="text-xs text-text-muted">{p.reason}</div>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary">
                      Resumes {new Date(p.resumeDate).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-text-muted text-sm">{message}</div>
  );
}

interface CustomerDetailPageProps {
  // No-op; types live inline above. This export is here to keep the file
  // self-contained.
}

// --- Modals are rendered conditionally from the main component ---

function PauseModal({
  subscriptionId,
  onClose,
  onDone,
}: {
  subscriptionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    startDate: today,
    endDate: tomorrow,
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await pauseSubscription(subscriptionId, form);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Pause failed');
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
            Pause subscription
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-text-secondary">
          Deliveries between these dates will be skipped. Auto-resume happens
          the day after the end date.
        </p>

        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Start date
          </span>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="input w-full mt-1.5 tabular"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            End date
          </span>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="input w-full mt-1.5 tabular"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Reason (optional)
          </span>
          <input
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Out of town"
            className="input w-full mt-1.5"
          />
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
            {submitting ? 'Pausing…' : 'Pause subscription'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecordPaymentModal({
  customerId,
  onClose,
  onDone,
}: {
  customerId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    amount: '',
    mode: 'CASH' as 'CASH' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET',
    reference: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await recordCashPayment({
        customerId,
        amount: Number(form.amount),
        mode: form.mode,
        reference: form.reference || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record payment');
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
            Record payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-text-secondary">
          Use this for cash or off-platform payments you want reflected on the
          customer ledger. The amount is added to balance immediately.
        </p>

        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Amount (₹) <span className="text-danger">*</span>
          </span>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="input w-full mt-1.5 tabular"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Mode
          </span>
          <select
            value={form.mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, mode: e.target.value as typeof f.mode }))
            }
            className="input w-full mt-1.5"
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="NETBANKING">Net banking</option>
            <option value="WALLET">Wallet</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Reference (optional)
          </span>
          <input
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="UPI ref / receipt no."
            className="input w-full mt-1.5 tabular"
          />
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
            {submitting ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Suppress unused-export warning
export type { CustomerDetailPageProps };
