'use client';

import { useEffect, useState } from 'react';

/**
 * Generic API-with-fallback hook.
 *
 * Calls `fetcher` on mount (and on dep change); if it fails, falls back to
 * `fallback` so the design demo still renders without a live backend.
 * The page can show a "demo data" pill based on `source`.
 *
 * Used by Dashboard, Routes, Customers, and any future API-backed screen.
 * Replaces 3 nearly-identical hand-written effects with a single primitive.
 */

export type ApiSource = 'live' | 'mock' | 'loading';

export interface UseApiResult<T> {
  data: T;
  source: ApiSource;
  error: Error | null;
  reload: () => void;
}

export function useApiWithFallback<TApi, T>(
  fetcher: () => Promise<TApi>,
  /** Map API payload to the shape the screen consumes. */
  transform: (raw: TApi) => T,
  fallback: T,
  deps: React.DependencyList = [],
): UseApiResult<T> {
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
        setData(fallback);
        setSource('mock');
        setError(err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, source, error, reload: () => setTick((n) => n + 1) };
}
