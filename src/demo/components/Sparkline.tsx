/** 内联 SVG 走势图。不引图表库——这点复杂度不值得多一个依赖。 */
export default function Sparkline({
  points,
  color = 'var(--color-series-1)',
  height = 120,
}: {
  points: number[];
  color?: string;
  height?: number;
}) {
  if (points.length < 2) return null;

  const W = 100;
  const H = 40;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;

  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p - min) / span) * (H - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  // 渐变 id 不能含 var(...) 里的括号，用可读的 slug
  const id = `grad-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,${H} L${xy.join(' L')} L${W},${H} Z`} fill={`url(#${id})`} />
      <polyline
        points={xy.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
