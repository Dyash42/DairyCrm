'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  clearToken,
  loginAdmin,
  setToken as persistToken,
} from './api';

interface User {
  id: string;
  name: string;
  role: 'ADMIN' | 'EXECUTIVE';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

const PUBLIC_PATHS = ['/login'];

/**
 * DEMO USER injected when no real JWT exists. Pages keep calling the
 * backend; each one falls back to mock data via useApiWithFallback
 * (which now treats 401 like any other error in demo mode rather
 * than redirecting to /login). Restore real auth by deleting the
 * DEMO_USER fallback below + the demo branch in the redirect effect.
 */
const DEMO_USER: User = {
  id: 'demo-admin',
  name: 'Anil Das (demo)',
  role: 'ADMIN',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Demo-mode hydration: ALWAYS use the demo user, regardless of
  // whether a stale JWT is in localStorage. We also explicitly purge
  // any stored token so every page's API call returns 401 and
  // useApiWithFallback drops in the seeded fixture data. Without this,
  // a JWT left over from a previous real login would let the
  // dashboard call the live backend and show mostly-zero numbers
  // (since the seeded DB has no delivery activity today).
  useEffect(() => {
    clearToken();
    setUser(DEMO_USER);
    setLoading(false);
  }, []);

  // Redirect /login away (the demo user is always "signed in" for this
  // build). Real flow can come back by switching `DEMO_USER` to null in
  // the no-token branch above.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (user && isPublic) router.replace('/');
  }, [user, loading, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginAdmin(email, password);
    persistToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
