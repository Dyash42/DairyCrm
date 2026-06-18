'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';

/**
 * Generic API-with-fallback hook.
 *
 * Calls `fetcher` on mount (and on dep change). The behavior on failure
 * depends on what kind of failure it was:
 *
 *   - **401 Unauthorized** — the token expired or was never valid. We
 *     redirect to /login. NEVER fall back to mock here — that used to
 *     show a "demo data" pill on the dashboard after the user was
 *     silently logged out, hiding the real problem.
 *
 *   - **404 / other 4xx** — propagate as an error so the page can show
 *     a proper empty-state. No mock fallback.
 *
 *   - **Network failure / 5xx** — backend unreachable. Render the mock
 *     so the design demo still works without a live backend, with a
 *     "demo data" pill via `source = 'mock'`.
 *
 * Used by Dashboard, Routes, Customers, and any future API-backed screen.
 */

export type ApiSource = 'live' | 'mock' | 'loading' | 'error';

export interface UseApiResult<T> {
  data: T;
  source: ApiSource;
  error: Error | null;
  reload: () => void;
}

/**
 * INT-09: the mock fixtures are a DESIGN-DEMO aid, not an outage fallback.
 * Showing them on a live 5xx/network error makes a down backend look like a
 * working (stale) dashboard an admin can act on. Gate the fallback behind an
 * explicit build-time flag; in production an infrastructure error surfaces as
 * an error state instead of fake data.
 */
const DEMO_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_DEMO === '1';

/** Heuristic: network / server-down errors that justify the mock fallback. */
function isInfrastructureError(err: unknown): boolean {
  if (err instanceof ApiError) {
    // Server unreachable: status is 0 here in the api helper; or 5xx.
    return err.status === 0 || err.status >= 500;
  }
  if (err instanceof TypeError) {
    // fetch() throws TypeError for connection-level failures.
    return true;
  }
  return false;
}

export function useApiWithFallback<TApi, T>(
  fetcher: () => Promise<TApi>,
  /** Map API payload to the shape the screen consumes. */
  transform: (raw: TApi) => T,
  fallback: T,
  deps: React.DependencyList = [],
): UseApiResult<T> {
  const router = useRouter();
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<ApiSource>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSource('loading');
    setError(null);
    fetcher()
      .then((raw) => {
        if (cancelled) return;
        setData(transform(raw));
        setSource('live');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // Token expired or never valid. Don't show fake data; route to login.
          router.replace('/login');
          setData(fallback);
          setSource('error');
          setError(err);
          return;
        }
        if (isInfrastructureError(err)) {
          // INT-09: only render fixtures when the demo flag is set. In
          // production a backend outage must read as an outage, not stale data.
          setData(fallback);
          setSource(DEMO_FALLBACK_ENABLED ? 'mock' : 'error');
          setError(err);
          return;
        }
        // 4xx that's not 401 → show the error, not the mock.
        setData(fallback);
        setSource('error');
        setError(err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, source, error, reload: () => setTick((n) => n + 1) };
}
