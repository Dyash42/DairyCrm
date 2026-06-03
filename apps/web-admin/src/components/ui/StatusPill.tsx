import { cn } from '@/lib/cn';

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONE_CLASSES: Record<PillTone, string> = {
  success: 'bg-success-light text-success-dark',
  warning: 'bg-warning-light text-warning-dark',
  danger: 'bg-danger-light text-danger-dark',
  info: 'bg-info-light text-info',
  muted: 'bg-surface-muted text-text-secondary border border-border',
};

export function StatusPill({
  tone = 'muted',
  children,
  className,
}: {
  tone?: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
