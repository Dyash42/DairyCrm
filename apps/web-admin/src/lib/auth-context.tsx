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
  fetchMe,
  loginAdmin,
  getToken,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Hydrate from token on mount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(({ user: u }) => {
        setUser({ id: u.sub, name: u.name, role: u.role });
      })
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Redirect unauthenticated users to /login
  useEffect(() => {
    if (loading) return;
    // /pin/<token> is a public customer page — never gate it behind login.
    const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/pin');
    if (!user && !isPublic) router.replace('/login');
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
