import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';
import CountUp from './CountUp';

/** 评分环。SVG stroke-dashoffset 过渡做绘制动画，起点转到正上方。 */
export default function ScoreRing({
  score,
  threshold,
  size = 120,
}: {
  score: number;
  threshold: number;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(reduced);

  useEffect(() => {
    if (reduced) return setDrawn(true);
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, [score, reduced]);

  const stroke = size > 90 ? 8 : 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = score >= threshold ? '#8ee0ba' : score >= 50 ? '#f1b991' : '#ffb4aa';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2b2d39" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (drawn ? score / 100 : 0))}
          style={{
            transition: reduced ? undefined : 'stroke-dashoffset 1.1s cubic-bezier(0,0,.2,1)',
            filter: `drop-shadow(0 0 6px ${color}55)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tabular-nums"
          style={{ color, fontSize: size > 90 ? 30 : 18 }}
        >
          <CountUp value={score} durationMs={1100} />
        </span>
        {size > 90 && <span className="text-muted mt-0.5 text-[11px]">/ 100</span>}
      </div>
    </div>
  );
}
