import { cn } from '@/lib/cn';

/**
 * Initials avatar — color is deterministic by name.
 */
const PALETTE = [
  'bg-brand-100 text-brand-700',
  'bg-info-light text-info',
  'bg-success-light text-success-dark',
  'bg-warning-light text-warning-dark',
  'bg-danger-light text-danger-dark',
];

function hashIndex(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function Avatar({
  initials,
  size = 36,
  className,
}: {
  initials: string;
  size?: number;
  className?: string;
}) {
  const palette = PALETTE[hashIndex(initials, PALETTE.length)];

  return (
    <div
      className={cn(
        'rounded-full font-semibold flex items-center justify-center shrink-0',
        palette,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}
