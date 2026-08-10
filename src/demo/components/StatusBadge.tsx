import type { CheckStatus, TxStatus } from '@/demo/types';

export type BadgeKind = TxStatus | CheckStatus | 'open' | 'resolved';

// 同 KpiTile：Tailwind 只认字面量类名，不能拼接。
const STYLE: Record<BadgeKind, { label: string; cls: string; glow: string }> = {
  queued: { label: '排队中', cls: 'text-muted bg-muted/12', glow: 'transparent' },
  validating: { label: 'AI 审核中', cls: 'text-info bg-info/12', glow: '#9fc5ff33' },
  passed: { label: '已通过', cls: 'text-ok bg-ok/12', glow: '#8ee0ba33' },
  challenged: { label: '待补充', cls: 'text-warn bg-warn/12', glow: '#f1b99133' },
  declined: { label: '未通过', cls: 'text-bad bg-bad/12', glow: '#ffb4aa33' },
  pass: { label: '正常', cls: 'text-ok bg-ok/12', glow: '#8ee0ba33' },
  warn: { label: '需留意', cls: 'text-warn bg-warn/12', glow: '#f1b99133' },
  fail: { label: '有风险', cls: 'text-bad bg-bad/12', glow: '#ffb4aa33' },
  open: { label: '等你处理', cls: 'text-warn bg-warn/12', glow: '#f1b99133' },
  resolved: { label: '已提交', cls: 'text-ok bg-ok/12', glow: '#8ee0ba33' },
};

export default function StatusBadge({ status }: { status: BadgeKind }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] font-medium ${s.cls}`}
      style={{ boxShadow: `0 0 12px ${s.glow}` }}
    >
      {s.label}
    </span>
  );
}
