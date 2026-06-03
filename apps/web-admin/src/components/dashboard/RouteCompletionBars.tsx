export type RouteCompletion = {
  routeName: string;
  pct: number; // 0–100
};

function colorFor(pct: number): string {
  if (pct >= 95) return '#1F8B4C'; // success
  if (pct >= 92) return '#3FA862'; // success light
  if (pct >= 90) return '#E08400'; // warning
  return '#C8362B'; // danger
}

export function RouteCompletionBars({ routes }: { routes: RouteCompletion[] }) {
  return (
    <div className="space-y-3">
      {routes.map((r) => {
        const color = colorFor(r.pct);
        return (
          <div key={r.routeName} className="flex items-center gap-4">
            <div className="w-16 shrink-0 text-sm text-text-secondary">
              {r.routeName}
            </div>
            <div className="flex-1 h-3 rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${r.pct}%`, backgroundColor: color }}
              />
            </div>
            <div className="tabular w-12 text-right text-sm font-semibold text-text-primary">
              {r.pct}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
