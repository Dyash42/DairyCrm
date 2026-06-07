'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Phone,
  Mail,
  MapPin,
  Power,
  Save,
  UserX,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import {
  fetchExecutiveDetail,
  fetchRoutes,
  updateExecutive,
  deactivateExecutive,
  ApiError,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { getInitials } from '@/lib/mock-data';

export default function ExecutiveDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const execId = params.id;

  const { data: exec, source, reload } = useApiWithFallback(
    () => fetchExecutiveDetail(execId),
    (raw) => raw,
    null as Awaited<ReturnType<typeof fetchExecutiveDetail>> | null,
    [execId],
  );

  const [availableRoutes, setAvailableRoutes] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    routeId: '',
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes()
      .then((r) =>
        setAvailableRoutes(r.routes.map((rr) => ({ id: rr.id, name: rr.name }))),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (exec) {
      setForm({
        name: exec.user.name,
        phone: exec.user.phone,
        email: exec.user.email ?? '',
        routeId: exec.routeId ?? '',
      });
      setDirty(false);
    }
  }, [exec]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateExecutive(execId, {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        routeId: form.routeId || null,
      });
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!exec) return;
    setError(null);
    try {
      if (exec.user.active) {
        const ok = window.confirm(
          `Deactivate ${exec.user.name}? They will not be able to log in. Their delivery history stays intact.`,
        );
        if (!ok) return;
        await deactivateExecutive(execId);
      } else {
        await updateExecutive(execId, { active: true });
      }
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    }
  }

  if (!exec) {
    return (
      <>
        <Topbar title="Executive" subtitle="Loading…" />
        <div className="px-8 py-6 text-text-secondary">
          {source === 'mock' ? 'Backend unreachable.' : 'Loading executive…'}
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={exec.user.name}
        subtitle={
          exec.route ? `Assigned to ${exec.route.name}` : 'No route assigned'
        }
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto space-y-6 max-w-4xl">
        <div>
          <Link
            href="/executives"
            className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={14} className="mr-1" />
            All executives
          </Link>
        </div>

        {/* Header */}
        <Card className="p-5 flex items-start gap-5">
          <Avatar initials={getInitials(exec.user.name)} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-text-primary">
                {exec.user.name}
              </h2>
              <StatusPill tone={exec.user.active ? 'success' : 'muted'}>
                {exec.user.active ? 'Active' : 'Inactive'}
              </StatusPill>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <Phone size={13} /> {exec.user.phone}
              </div>
              {exec.user.email && (
                <div className="flex items-center gap-2">
                  <Mail size={13} /> {exec.user.email}
                </div>
              )}
              {exec.route && (
                <div className="flex items-center gap-2">
                  <MapPin size={13} /> {exec.route.area} ·{' '}
                  {exec.route.pinCodes.join(', ')}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={toggleActive}
            className={`btn-secondary ${
              exec.user.active ? 'text-danger-dark' : 'text-success-dark'
            }`}
          >
            {exec.user.active ? (
              <>
                <UserX size={14} /> Deactivate
              </>
            ) : (
              <>
                <Power size={14} /> Reactivate
              </>
            )}
          </button>
        </Card>

        {/* Editable details */}
        <Card>
          <CardHeader
            title="Profile"
            subtitle="Edit contact information and route assignment"
            action={
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="btn-primary disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            }
          />
          <CardBody className="grid grid-cols-2 gap-4">
            <FieldBlock label="Name">
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="input w-full"
              />
            </FieldBlock>
            <FieldBlock label="Phone">
              <input
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                className="input w-full tabular"
              />
            </FieldBlock>
            <FieldBlock label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="input w-full"
              />
            </FieldBlock>
            <FieldBlock label="Assigned route">
              <select
                value={form.routeId}
                onChange={(e) => update('routeId', e.target.value)}
                className="input w-full"
              >
                <option value="">— unassigned —</option>
                {availableRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FieldBlock>
            {error && (
              <div className="col-span-2 bg-danger-light text-danger-dark text-sm rounded-lg p-3">
                {error}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Route quick-jump */}
        {exec.route && (
          <Card>
            <CardHeader
              title="Their route"
              subtitle={`${exec.route.name} · ${exec.route.area}`}
              action={
                <button
                  onClick={() => router.push(`/routes/${exec.route!.id}`)}
                  className="btn-secondary"
                >
                  Open route detail
                </button>
              }
            />
          </Card>
        )}
      </div>
    </>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
