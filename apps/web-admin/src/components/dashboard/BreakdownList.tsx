import { cn } from '@/lib/cn';

export type BreakdownItem = {
  label: string;
  value: number;
  dotClass: string; // tailwind bg color
};

export function BreakdownList({ items }: { items: BreakdownItem[] }) {
  return (
    <ul className="divide-y divide-divider">
      {items.map((it) => (
        <li
          key={it.label}
          className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
        >
          <div className="flex items-center gap-3">
            <span className={cn('w-2 h-2 rounded-full', it.dotClass)} />
            <span className="text-sm text-text-primary">{it.label}</span>
          </div>
          <span className="tabular text-sm font-semibold text-text-primary">
            {it.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
