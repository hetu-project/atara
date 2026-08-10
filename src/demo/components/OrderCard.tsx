import { fmtAmount, fmtFiat, timeAgo } from '@/demo/format';
import type { PoolOrder } from '@/demo/types';

/**
 * 交易大厅里的一张挂单卡。
 *
 * 卡片比表格行占地方，但普通用户扫一眼就能判断「要不要接」——对方是谁、
 * 靠不靠谱、多少钱、什么币，全在一屏里，不用横向对照表头。
 */
export default function OrderCard({
  order,
  isNew,
  index = 0,
  onPick,
}: {
  order: PoolOrder;
  isNew?: boolean;
  /** 用于鱼贯入场：按序号错开动画起始时间 */
  index?: number;
  onPick: () => void;
}) {
  const cp = order.counterparty;
  const scoreTone =
    cp.score >= 80 ? 'text-ok bg-ok/12' : cp.score >= 65 ? 'text-warn bg-warn/12' : 'text-bad bg-bad/12';

  return (
    <button
      onClick={onPick}
      className={`group bg-surface border-hairline hover:border-brand/50 relative flex flex-col rounded-[var(--radius-panel)] border p-5 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-panel)] ${
        isNew ? 'animate-[slideIn_.45s_ease-out]' : 'animate-[cardIn_.5s_cubic-bezier(.2,.9,.3,1)_backwards]'
      }`}
      style={
        isNew
          ? {
              animationDelay: '0ms',
              boxShadow:
                '0 0 0 1px color-mix(in oklab, var(--color-brand) 34%, transparent), 0 0 24px color-mix(in oklab, var(--color-brand) 14%, transparent)',
            }
          : { animationDelay: `${Math.min(index, 14) * 45}ms` }
      }
    >
      {/* 顶行：方向 + 挂出时间 */}
      <div className="mb-4 flex items-center justify-between">
        <span
          className={`rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.08em] ${
            order.side === 'sell' ? 'text-ok bg-ok/12' : 'text-info bg-info/12'
          }`}
        >
          {order.side === 'sell' ? 'SELL' : 'BUY'}
        </span>
        <span className="text-muted text-[11px]">{timeAgo(order.postedAt)}</span>
      </div>

      {/* 主体：数量与对价 */}
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">
          {fmtAmount(order.amount)}
        </span>
        <span className="text-[15px] font-medium">{order.asset}</span>
        <span className="text-muted text-[11px]">{order.chain}</span>
      </div>
      <div className="text-muted mb-5 text-[13px] tabular-nums">
        {fmtFiat(order.fiatTotal, order.fiatCurrency)}
        <span className="mx-1.5">·</span>
        单价 {fmtAmount(order.price)}
      </div>

      {/* 对方 */}
      <div className="border-hairline mt-auto flex items-center gap-3 border-t pt-4">
        <span className="bg-surface-raised text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">
          {cp.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px]">{cp.name}</span>
            {cp.verified && (
              <span className="text-ok shrink-0 text-[11px]" title="已实名">
                ✓
              </span>
            )}
          </span>
          <span className="text-muted block text-[11px]">
            成交 {cp.completedTrades} 笔 · 纠纷 {cp.disputes} 次
          </span>
        </span>
        <span
          className={`shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-semibold tabular-nums ${scoreTone}`}
          title="信用分"
        >
          {cp.score}
        </span>
      </div>

      {/* 悬停时出现的接单条 */}
      <span className="bg-brand text-on-brand absolute inset-x-0 bottom-0 h-0 overflow-hidden rounded-b-[var(--radius-panel)] text-center text-[13px] font-semibold transition-all duration-200 group-hover:h-9 group-hover:leading-9">
        立即成交 →
      </span>
    </button>
  );
}
