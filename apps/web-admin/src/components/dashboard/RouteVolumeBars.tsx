export type RouteVolume = {
  routeName: string;
  litres: number;
};

export function RouteVolumeBars({ routes }: { routes: RouteVolume[] }) {
  const max = Math.max(...routes.map((r) => r.litres), 1);

  return (
    <div className="space-y-3">
      {routes.map((r) => {
        const pct = (r.litres / max) * 100;
        return (
          <div key={r.routeName} className="flex items-center gap-4">
            <div className="w-16 shrink-0 text-sm text-text-secondary">
              {r.routeName}
            </div>
            <div className="flex-1 h-3 rounded-full bg-brand-50 overflow-hidden">
              <div
                className="h-full bg-brand rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="tabular w-14 text-right text-sm font-semibold text-text-primary">
              {r.litres}L
            </div>
          </div>
        );
      })}
    </div>
  );
}
