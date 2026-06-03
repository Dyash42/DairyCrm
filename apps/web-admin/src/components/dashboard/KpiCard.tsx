import { Card } from '@/components/ui/Card';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  deltaPct: number;
  iconBgClass?: string;
  iconColorClass?: string;
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  deltaPct,
  iconBgClass = 'bg-brand-50',
  iconColorClass = 'text-brand',
}: KpiCardProps) {
  const positive = deltaPct >= 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            iconBgClass,
          )}
        >
          <Icon size={18} className={iconColorClass} />
        </div>
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            positive ? 'text-success' : 'text-danger',
          )}
        >
          <TrendIcon size={14} />
          <span>{Math.abs(deltaPct).toFixed(1)}%</span>
        </div>
      </div>

      <div className="flex items-baseline gap-1 tabular">
        <span className="text-3xl font-semibold text-text-primary leading-none">
          {value}
        </span>
        {unit && (
          <span className="text-sm text-text-secondary font-medium">{unit}</span>
        )}
      </div>
      <div className="text-sm text-text-secondary mt-1.5">{label}</div>
    </Card>
  );
}
