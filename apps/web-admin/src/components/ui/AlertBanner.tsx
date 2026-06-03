import { AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AlertTone = 'danger' | 'warning' | 'info';

const TONE: Record<
  AlertTone,
  { bg: string; border: string; icon: string; text: string; link: string }
> = {
  danger: {
    bg: 'bg-danger-light',
    border: 'border-danger/20',
    icon: 'text-danger',
    text: 'text-danger-dark',
    link: 'text-danger hover:text-danger-dark',
  },
  warning: {
    bg: 'bg-warning-light',
    border: 'border-warning/20',
    icon: 'text-warning-dark',
    text: 'text-warning-dark',
    link: 'text-warning-dark hover:text-warning',
  },
  info: {
    bg: 'bg-info-light',
    border: 'border-info/20',
    icon: 'text-info',
    text: 'text-info',
    link: 'text-info hover:text-brand',
  },
};

export function AlertBanner({
  tone = 'danger',
  message,
  cta,
  onCtaClick,
}: {
  tone?: AlertTone;
  message: React.ReactNode;
  cta?: string;
  onCtaClick?: () => void;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3 rounded-xl border',
        t.bg,
        t.border,
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle size={16} className={cn('shrink-0', t.icon)} />
        <span className={cn('text-sm', t.text)}>{message}</span>
      </div>
      {cta && (
        <button
          type="button"
          onClick={onCtaClick}
          className={cn(
            'flex items-center gap-1 text-sm font-medium shrink-0',
            t.link,
          )}
        >
          {cta}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
