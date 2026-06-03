'use client';

import { Search, Bell } from 'lucide-react';

export type TopbarProps = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex items-center justify-between px-8 py-6 border-b border-divider bg-bg">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-text-primary leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-text-secondary mt-1 truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search customers, routes…"
            className="input pl-9 w-80 bg-surface"
          />
        </div>
        <button
          aria-label="Notifications"
          className="relative h-10 w-10 rounded-lg bg-surface border border-border flex items-center justify-center hover:bg-surface-muted"
        >
          <Bell size={17} className="text-text-secondary" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-danger" />
        </button>
      </div>
    </header>
  );
}
