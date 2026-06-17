'use client';

import { usePathname } from 'next/navigation';
import { AdminShell } from './AdminShell';

/**
 * Wraps the app shell so /login (and any future public route) renders
 * without the sidebar/topbar.
 */
const PUBLIC_PATHS = ['/login'];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /pin/<token> is the public customer location page — no admin shell.
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/pin')) {
    return <>{children}</>;
  }
  return <AdminShell>{children}</AdminShell>;
}
