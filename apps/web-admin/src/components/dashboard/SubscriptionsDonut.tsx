export type SubscriptionsBreakdown = {
  active: number;
  paused: number;
  cancelled: number;
};

/**
 * SVG donut chart — Active / Paused / Cancelled.
 * Big total label in the middle.
 */
export function SubscriptionsDonut({ data }: { data: SubscriptionsBreakdown }) {
  const total = data.active + data.paused + data.cancelled;
  if (total === 0) return null;

  const size = 180;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;

  const seg = (val: number) => (val / total) * C;
  const activeLen = seg(data.active);
  const pausedLen = seg(data.paused);
  const cancelledLen = seg(data.cancelled);

  // Start at top (12 o'clock)
  const startAngle = -90;
  let offset = 0;

  const segments = [
    { color: '#1F8B4C', len: activeLen, off: offset },
    { color: '#E08400', len: pausedLen, off: (offset += activeLen) },
    { color: '#C8362B', len: cancelledLen, off: (offset += pausedLen) },
  ];

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: `rotate(${startAngle}deg)` }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#EEF1F4"
            strokeWidth={stroke}
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.len} ${C - s.len}`}
              strokeDashoffset={-s.off}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="tabular text-3xl font-semibold text-text-primary leading-none">
            {total}
          </div>
          <div className="text-xs text-text-secondary mt-1">total</div>
        </div>
      </div>

      <div className="space-y-2.5 flex-1">
        <LegendRow color="#1F8B4C" label="Active" value={data.active} />
        <LegendRow color="#E08400" label="Paused" value={data.paused} />
        <LegendRow color="#C8362B" label="Cancelled" value={data.cancelled} />
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-text-primary">{label}</span>
      </div>
      <span className="tabular text-sm font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}
