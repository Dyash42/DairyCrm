'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Download,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  bulkValidate,
  bulkCommit,
  downloadBulkTemplate,
  type BulkValidationResult,
  ApiError,
} from '@/lib/api';

type Phase = 'pick' | 'preview' | 'committed';

export default function ImportPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<BulkValidationResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState<{ imported: number; failures: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    const text = await file.text();
    setCsv(text);
    await runValidate(text);
  }

  async function runValidate(csvText: string) {
    setError(null);
    try {
      const res = await bulkValidate(csvText);
      setResult(res);
      setPhase('preview');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not validate the file');
    }
  }

  async function onCommit() {
    if (!result || result.valid.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await bulkCommit(result.valid);
      setCommitted({ imported: res.imported, failures: res.failures.length });
      setPhase('committed');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setCommitting(false);
    }
  }

  const issuesByRow = useMemo(() => {
    const m = new Map<number, BulkValidationResult['issues']>();
    if (!result) return m;
    for (const i of result.issues) {
      const arr = m.get(i.row) ?? [];
      arr.push(i);
      m.set(i.row, arr);
    }
    return m;
  }, [result]);

  return (
    <>
      <Topbar
        title="Import customers"
        subtitle="Onboard your existing book — bulk CSV upload"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={14} className="mr-1" />
            Back to customers
          </Link>
        </div>

        {phase === 'pick' && (
          <Card>
            <CardHeader
              title="Step 1 — Download the template"
              subtitle="Fill it in Excel with your existing 400–500 customer records, then upload"
              action={
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await downloadBulkTemplate();
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : 'Download failed');
                    }
                  }}
                  className="btn-secondary"
                >
                  <Download size={16} />
                  Template (CSV)
                </button>
              }
            />
            <CardBody>
              <div className="text-sm text-text-secondary space-y-2">
                <p>
                  Required columns: <code>name · phone · address_line1 · route_name · litres_per_day</code>.
                </p>
                <p>
                  Routes must already exist on the Routes page. Products must exist on the
                  Products page (we ship <code>COW_MILK</code>, <code>BUFFALO_MILK</code>, etc. by default).
                </p>
                <p>
                  Days-of-week shorthand: <code>EVERY_DAY</code> · <code>MON_TO_SAT</code> ·{' '}
                  <code>WEEKDAYS</code> · <code>WEEKENDS</code>, or a numeric list like{' '}
                  <code>1,2,3,4,5,6</code> (0=Sun … 6=Sat).
                </p>
                <p>
                  The full column reference is listed above — download the
                  template below to start from a pre-filled example file.
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        {phase === 'pick' && (
          <Card>
            <CardHeader
              title="Step 2 — Upload the filled CSV"
              subtitle="Drag-drop your file or paste the rows below"
            />
            <CardBody className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) await onFile(f);
                }}
                onClick={() => fileInput.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-brand hover:bg-brand-50 transition-colors"
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await onFile(f);
                  }}
                />
                <Upload size={28} className="mx-auto text-text-secondary mb-3" />
                <div className="text-sm font-semibold text-text-primary">
                  Drop the CSV here, or click to pick
                </div>
                <div className="text-xs text-text-muted mt-1">
                  Up to 2,000 rows per upload
                </div>
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer text-text-secondary">
                  …or paste CSV text
                </summary>
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={6}
                  placeholder="name,phone,..."
                  className="input w-full p-3 font-mono text-xs mt-2"
                />
                <button
                  type="button"
                  onClick={() => runValidate(csv)}
                  disabled={csv.trim() === ''}
                  className="btn-primary mt-2 disabled:opacity-50"
                >
                  Validate paste
                </button>
              </details>

              {error && (
                <div className="bg-danger-light text-danger-dark text-sm rounded-lg p-3">
                  {error}
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {phase === 'preview' && result && (
          <>
            <Card>
              <CardHeader
                title="Preview"
                subtitle={`${result.summary.rowsValid} ready · ${result.summary.errorCount} error(s) · ${result.summary.warningCount} warning(s)`}
                action={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPhase('pick');
                        setResult(null);
                        setCsv('');
                      }}
                      className="btn-secondary"
                    >
                      Start over
                    </button>
                    <button
                      type="button"
                      onClick={onCommit}
                      disabled={committing || result.valid.length === 0}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {committing
                        ? 'Importing…'
                        : `Import ${result.valid.length} customer${result.valid.length === 1 ? '' : 's'}`}
                    </button>
                  </div>
                }
              />
              <CardBody>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <SummaryStat
                    label="Rows submitted"
                    value={result.summary.rowsSubmitted}
                  />
                  <SummaryStat
                    label="Ready to import"
                    value={result.summary.rowsValid}
                    tone="success"
                  />
                  <SummaryStat
                    label="Errors blocking import"
                    value={result.summary.errorCount}
                    tone={result.summary.errorCount > 0 ? 'danger' : 'muted'}
                  />
                </div>
                {error && (
                  <div className="bg-danger-light text-danger-dark text-sm rounded-lg p-3 mb-3">
                    {error}
                  </div>
                )}
              </CardBody>
            </Card>

            {result.issues.length > 0 && (
              <Card>
                <CardHeader
                  title="Issues"
                  subtitle="Rows with errors will be skipped. Fix in Excel and re-upload."
                />
                <CardBody>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Column</th>
                        <th>Issue</th>
                        <th>Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.issues.map((iss, i) => (
                        <tr key={i}>
                          <td className="tabular">{iss.row}</td>
                          <td>{iss.column ?? '—'}</td>
                          <td>{iss.message}</td>
                          <td>
                            <StatusPill
                              tone={iss.severity === 'error' ? 'danger' : 'warning'}
                            >
                              {iss.severity}
                            </StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            )}

            {result.valid.length > 0 && (
              <Card>
                <CardHeader title="Will be imported" subtitle={`${result.valid.length} rows`} />
                <CardBody>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Route</th>
                        <th>Product</th>
                        <th>L/day</th>
                        <th>Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.valid.slice(0, 100).map((r) => (
                        <tr key={r.row}>
                          <td className="tabular">{r.row}</td>
                          <td>{r.name}</td>
                          <td className="tabular">{r.phone}</td>
                          <td>{r.routeName}</td>
                          <td>{r.productCode}</td>
                          <td className="tabular">{r.litresPerDay}</td>
                          <td className="text-xs text-text-muted">
                            {r.customerCode ?? 'auto'}
                          </td>
                        </tr>
                      ))}
                      {result.valid.length > 100 && (
                        <tr>
                          <td colSpan={7} className="text-center text-text-muted">
                            + {result.valid.length - 100} more
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            )}
          </>
        )}

        {phase === 'committed' && committed && (
          <Card>
            <CardBody className="text-center py-12">
              <CheckCircle2 size={56} className="mx-auto text-success" />
              <div className="mt-4 text-xl font-semibold text-text-primary">
                {committed.imported} customer{committed.imported === 1 ? '' : 's'} imported
              </div>
              {committed.failures > 0 && (
                <div className="mt-2 text-warning-dark text-sm">
                  {committed.failures} row(s) failed during import
                </div>
              )}
              <button
                onClick={() => router.push('/customers')}
                className="btn-primary mt-6"
              >
                Go to customers
              </button>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: number;
  tone?: 'success' | 'danger' | 'muted';
}) {
  const color =
    tone === 'success'
      ? 'text-success-dark'
      : tone === 'danger'
        ? 'text-danger-dark'
        : 'text-text-primary';
  return (
    <div className="bg-surface-muted rounded-lg p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted font-semibold">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular ${color} mt-1`}>{value}</div>
    </div>
  );
}
