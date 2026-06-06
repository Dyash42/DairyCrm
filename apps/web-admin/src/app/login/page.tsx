'use client';

import { useState } from 'react';
import { Droplet, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Could not reach the server. Check your connection.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md card-pad space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
            <Droplet size={20} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-text-primary">Jharanai</div>
            <div className="text-xs text-text-muted uppercase tracking-wider">
              Ops Console
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
          <p className="text-sm text-text-secondary mt-1">
            Operations admin only.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="input w-full mt-1.5"
              placeholder="anil@jharanai.local"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="input w-full mt-1.5"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-lg bg-danger-light text-danger-dark px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? 'Signing in…' : (
            <>
              <LogIn size={16} />
              Sign in
            </>
          )}
        </button>

        <p className="text-xs text-text-muted text-center">
          Forgot your password? Ask your administrator.
        </p>
      </form>
    </div>
  );
}
