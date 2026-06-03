/**
 * Simple SVG area chart — no library needed.
 * Shows litres delivered through the morning.
 */

export type HourlyPoint = { hour: number; litres: number };

const HOUR_LABEL: Record<number, string> = {
  6: '6a',
  7: '7a',
  8: '8a',
  9: '9a',
  10: '10a',
  11: '11a',
  12: '12p',
};

export function HourlyDeliveryChart({ data }: { data: HourlyPoint[] }) {
  if (data.length === 0) return null;

  const W = 600;
  const H = 200;
  const PAD = { top: 20, right: 16, bottom: 28, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxY = Math.max(...data.map((d) => d.litres)) * 1.1;
  const xStep = innerW / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + innerH - (d.litres / maxY) * innerH,
    label: HOUR_LABEL[d.hour] ?? `${d.hour}`,
  }));

  // Smooth path using monotone-like control points
  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x},${p.y}`;
      const prev = points[i - 1];
      if (!prev) return `M ${p.x},${p.y}`;
      const midX = (prev.x + p.x) / 2;
      return `C ${midX},${prev.y} ${midX},${p.y} ${p.x},${p.y}`;
    })
    .join(' ');

  const areaPath =
    linePath +
    ` L ${points[points.length - 1]?.x ?? 0},${PAD.top + innerH}` +
    ` L ${points[0]?.x ?? 0},${PAD.top + innerH} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="hourlyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F77B4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1F77B4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Faint baseline */}
        <line
          x1={PAD.left}
          y1={PAD.top + innerH}
          x2={PAD.left + innerW}
          y2={PAD.top + innerH}
          stroke="#EEF1F4"
          strokeWidth={1}
        />

        <path d={areaPath} fill="url(#hourlyFill)" />
        <path d={linePath} fill="none" stroke="#1F4E78" strokeWidth={2.5} />

        {/* End point dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1]?.x}
            cy={points[points.length - 1]?.y}
            r={5}
            fill="#1F4E78"
          />
        )}

        {/* Hour labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H - 8}
            textAnchor="middle"
            className="fill-text-muted"
            style={{ fontSize: '11px' }}
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
