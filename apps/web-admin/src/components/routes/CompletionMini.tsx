/**
 * Inline thin completion bar + percent — used in Routes table.
 */
function colorFor(pct: number): string {
  if (pct >= 95) return '#1F8B4C';
  if (pct >= 92) return '#3FA862';
  if (pct >= 90) return '#E08400';
  return '#C8362B';
}

export function CompletionMini({ pct }: { pct?: number }) {
  if (pct === undefined) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-32 h-2 rounded-full bg-surface-muted" />
        <span className="tabular text-sm text-text-muted">—</span>
      </div>
    );
  }

  const color = colorFor(pct);
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="tabular text-sm font-semibold text-text-primary">
        {pct}%
      </span>
    </div>
  );
}
