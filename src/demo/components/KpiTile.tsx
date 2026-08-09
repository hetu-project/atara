import type { ReactNode } from 'react';
import CountUp from './CountUp';

// 必须写成完整类名的字面量。Tailwind 靠扫源码里的字符串生成 CSS，
// `text-${accent}` 这种拼接它看不见，运行时会得到一个不存在的类。
const TONE = {
  brand: 'text-brand',
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
} as const;

export default function KpiTile({
  label,
  value,
  sub,
  accent,
  decimals = 0,
}: {
  label: string;
  value: number | string;
  sub?: ReactNode;
  /** 大数字用强调色。用于「通过率」这类正向指标。 */
  accent?: keyof typeof TONE;
  decimals?: number;
}) {
  const tone = accent ? TONE[accent] : '';

  return (
    <div className="bg-surface border-hairline rounded-[var(--radius-panel)] border p-[22px]">
      <div className="text-muted text-[11px] font-semibold tracking-[0.08em]">{label}</div>
      <div className={`mt-3 text-[32px] leading-none font-semibold tabular-nums ${tone}`}>
        {typeof value === 'number' ? <CountUp value={value} decimals={decimals} /> : value}
      </div>
      {sub && <div className="text-muted mt-2 text-[12px]">{sub}</div>}
    </div>
  );
}
