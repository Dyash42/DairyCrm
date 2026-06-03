'use client';

import { cn } from '@/lib/cn';

export type Tab<T extends string> = { value: T; label: string };

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center p-1 rounded-lg bg-surface-muted border border-border',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              'px-4 h-8 rounded-md text-sm font-medium transition-colors',
              active
                ? 'bg-surface text-text-primary shadow-card'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
