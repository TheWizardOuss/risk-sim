
type DonutGaugeProps = {
  value: number; // 0..1
  size?: number;
  thickness?: number;
  label?: string;
  color?: string;
};

export function DonutGauge({ value, size = 140, thickness = 14, label, color = '#16a34a' }: DonutGaugeProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value || 0));
  const dash = clamped * circumference;
  const rest = circumference - dash;
  const center = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={label} role="img">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${rest}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={20} fontWeight={700} fill="#111827">
        {(clamped * 100).toFixed(0)}%
      </text>
      {label && (
        <text x="50%" y={center + 24} dominantBaseline="hanging" textAnchor="middle" fontSize={12} fill="#6b7280">
          {label}
        </text>
      )}
    </svg>
  );
}

type HistogramProps = {
  bins: number[];
  maxX: number; // max value represented on x-axis
  width?: number;
  height?: number;
  xLabel?: string;
};

export function Histogram({ bins, maxX, width = 420, height = 160, xLabel = 'Days late' }: HistogramProps) {
  if (!bins || bins.length === 0 || maxX <= 0) {
    return <div className="meta">No late runs — nothing to show.</div>;
  }
  const pad = { t: 10, r: 12, b: 28, l: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxCount = Math.max(...bins);
  const barW = innerW / bins.length;
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxCount * i) / ticks));

  return (
    <svg width={width} height={height} role="img" aria-label="Delay histogram">
      {/* axes */}
      <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="#e5e7eb" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} stroke="#e5e7eb" />
      {yTicks.map((t, i) => {
        const y = height - pad.b - (t / maxCount) * innerH;
        return (
          <g key={i}>
            <line x1={pad.l - 4} y1={y} x2={pad.l} y2={y} stroke="#9ca3af" />
            <text x={pad.l - 8} y={y} textAnchor="end" dominantBaseline="central" fontSize={10} fill="#6b7280">{t}</text>
          </g>
        );
      })}
      {bins.map((c, i) => {
        const h = maxCount ? (c / maxCount) * innerH : 0;
        const x = pad.l + i * barW + 1;
        const y = height - pad.b - h;
        return <rect key={i} x={x} y={y} width={Math.max(0, barW - 2)} height={h} fill="#2563eb" opacity={0.8} rx={2} />;
      })}
      {/* X ticks */}
      <text x={(width) / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="#6b7280">{xLabel}</text>
      <text x={pad.l} y={height - pad.b + 12} textAnchor="start" fontSize={10} fill="#9ca3af">0</text>
      <text x={width - pad.r} y={height - pad.b + 12} textAnchor="end" fontSize={10} fill="#9ca3af">{Math.round(maxX)}</text>
    </svg>
  );
}

type CDFProps = {
  bins: number[];
  maxX: number;
  width?: number;
  height?: number;
  xLabel?: string;
};

export function CDF({ bins, maxX, width = 420, height = 160, xLabel = 'Days late' }: CDFProps) {
  if (!bins || bins.length === 0 || maxX <= 0) {
    return <div className="meta">No late runs — nothing to show.</div>;
  }
  const pad = { t: 10, r: 12, b: 28, l: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const total = bins.reduce((s, x) => s + x, 0);
  const cumulative: number[] = [];
  let acc = 0;
  for (let i = 0; i < bins.length; i++) { acc += bins[i]; cumulative.push(acc); }
  const points = cumulative.map((c, i) => {
    const x = pad.l + (i / (bins.length - 1)) * innerW;
    const y = height - pad.b - (total ? (c / total) * innerH : 0);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} role="img" aria-label="CDF of late delays">
      <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="#e5e7eb" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} stroke="#e5e7eb" />
      <polyline fill="none" stroke="#111827" strokeWidth={2} points={points} />
      <text x={(width) / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="#6b7280">{xLabel}</text>
      <text x={pad.l} y={height - pad.b + 12} textAnchor="start" fontSize={10} fill="#9ca3af">0</text>
      <text x={width - pad.r} y={height - pad.b + 12} textAnchor="end" fontSize={10} fill="#9ca3af">{Math.round(maxX)}</text>
      <text x={pad.l - 8} y={pad.t} textAnchor="end" fontSize={10} fill="#9ca3af">100%</text>
      <text x={pad.l - 8} y={height - pad.b} textAnchor="end" fontSize={10} fill="#9ca3af">0%</text>
    </svg>
  );
}

type StackedBarProps = {
  segments: { value: number; color: string; label: string }[]; // values sum to 1
  width?: number;
  height?: number;
};

export function StackedBar({ segments, width = 420, height = 20 }: StackedBarProps) {
  const w = width;
  let x = 0;
  return (
    <svg width={w} height={height} role="img" aria-label="Outcomes breakdown">
      {segments.map((s, i) => {
        const segW = Math.max(0, s.value) * w;
        const rect = <rect key={i} x={x} y={0} width={segW} height={height} fill={s.color} />;
        x += segW;
        return rect;
      })}
    </svg>
  );
}

type HBarProps = {
  items: { name: string; value: number }[]; // already sorted desc
  width?: number;
  height?: number; // auto-rows otherwise
};

export function HBars({ items, width = 420, height }: HBarProps) {
  const rowH = 24;
  const gap = 10;
  const h = height ?? (items.length * (rowH + gap));
  const max = Math.max(...items.map(i => i.value), 1);
  const pad = { l: 120, r: 12, t: 6, b: 6 };
  const innerW = width - pad.l - pad.r;
  return (
    <svg width={width} height={h + pad.t + pad.b} role="img" aria-label="Risk impact ranking">
      {items.map((it, idx) => {
        const y = pad.t + idx * (rowH + gap);
        const w = (it.value / max) * innerW;
        return (
          <g key={idx}>
            <text x={pad.l - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#374151">{it.name}</text>
            <rect x={pad.l} y={y} width={w} height={rowH} fill="#2563eb" rx={4} opacity={0.85} />
            <text x={pad.l + w + 6} y={y + rowH / 2} dominantBaseline="central" fontSize={11} fill="#6b7280">{it.value.toFixed(1)}</text>
          </g>
        );
      })}
    </svg>
  );
}
