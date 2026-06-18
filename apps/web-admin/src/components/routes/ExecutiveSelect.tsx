'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export function ExecutiveSelect({
  executives,
  selectedId,
  onChange,
}: {
  executives: { id: string; name: string }[];
  selectedId?: string;
  onChange?: (id: string) => void;
}) {
  const selected = executives.find((e) => e.id === selectedId);
  const unassigned = !selected;

  return (
    <div className="relative inline-block w-56">
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'appearance-none w-full h-9 pl-3 pr-9 rounded-lg text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-brand/20',
          unassigned
            ? 'bg-danger-light text-danger-dark border border-danger/30'
            : 'bg-surface border border-border text-text-primary',
        )}
      >
        {/* Always present so an admin can CLEAR an assignment, not only when
            already unassigned (audit WEB-12). */}
        <option value="">— Unassigned —</option>
        {executives.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className={cn(
          'absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none',
          unassigned ? 'text-danger-dark' : 'text-text-muted',
        )}
      />
    </div>
  );
}
