import type { CheckStatus, TxStatus } from '@/demo/types';

export type BadgeKind = TxStatus | CheckStatus | 'open' | 'resolved';

// 同 KpiTile：Tailwind 只认字面量类名，不能拼接。
// glow 用令牌名而非写死的 hex——写死的话浅色主题下辉光颜色会对不上。
const STYLE: Record<BadgeKind, { label: string; cls: string; glow: string | null }> = {
  queued: { label: '排队中', cls: 'text-muted bg-muted/12', glow: null },
  validating: { label: 'AI 审核中', cls: 'text-info bg-info/12', glow: '--color-info' },
  passed: { label: '已通过', cls: 'text-ok bg-ok/12', glow: '--color-ok' },
  challenged: { label: '待补充', cls: 'text-warn bg-warn/12', glow: '--color-warn' },
  declined: { label: '未通过', cls: 'text-bad bg-bad/12', glow: '--color-bad' },
  pass: { label: '正常', cls: 'text-ok bg-ok/12', glow: '--color-ok' },
  warn: { label: '需留意', cls: 'text-warn bg-warn/12', glow: '--color-warn' },
  fail: { label: '有风险', cls: 'text-bad bg-bad/12', glow: '--color-bad' },
  open: { label: '等你处理', cls: 'text-warn bg-warn/12', glow: '--color-warn' },
  resolved: { label: '已提交', cls: 'text-ok bg-ok/12', glow: '--color-ok' },
};

export default function StatusBadge({ status }: { status: BadgeKind }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] font-medium ${s.cls}`}
      style={
        s.glow
          ? { boxShadow: `0 0 12px color-mix(in oklab, var(${s.glow}) 22%, transparent)` }
          : undefined
      }
    >
      {s.label}
    </span>
  );
}
