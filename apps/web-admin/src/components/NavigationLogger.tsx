'use client';

/**
 * Sends every client-side route change to the backend so it shows up
 * in apps/backend/logs/server.log alongside backend events.
 *
 * Lives in the root layout so it tracks every page in the app. Skips
 * the login page itself (no token yet → backend would 401, which we
 * ignore silently but it's still wasted noise).
 */

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { logAdminEvent } from '@/lib/api';

export function NavigationLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (pathname === '/login') return;
    const search = searchParams?.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;
    logAdminEvent('page-view', fullPath);
    // Disable exhaustive-deps — we explicitly want a new log line on
    // every URL change, not just on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);

  return null;
}
