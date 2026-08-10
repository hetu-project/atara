import { useNavigate } from 'react-router';
import Drawer from '@/demo/components/Drawer';
import ScoreRing from '@/demo/components/ScoreRing';
import { matchOrder } from '@/demo/engine/matching';
import { fmtAmount, fmtFiat } from '@/demo/format';
import type { Desk, PoolOrder } from '@/demo/types';

/**
 * 接单前的确认抽屉。只负责「看清楚对方是谁」和「确认」——
 * 真正的演出在 MatchCeremony 里，点确认后接管全屏。
 */
export default function MatchDrawer({
  order,
  desk,
  onClose,
  onConfirm,
}: {
  order: PoolOrder | null;
  desk: Desk;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const navigate = useNavigate();
  const verdict = matchOrder(desk);

  return (
    <Drawer open={order !== null} onClose={onClose} title="确认接单">
      {order && (
        <div className="space-y-6">
          <section>
            <SectionLabel>这一单</SectionLabel>
            <div className="bg-bg border-hairline rounded-[var(--radius-sm)] border p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[22px] font-semibold tabular-nums">
                  {fmtAmount(order.amount)} {order.asset}
                </span>
                <span className="text-muted text-[12px]">
                  {order.side === 'sell' ? '对方出售' : '对方求购'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-y-3 text-[13px]">
                <Field label="你要付">{fmtFiat(order.fiatTotal, order.fiatCurrency)}</Field>
                <Field label="单价">{fmtAmount(order.price)}</Field>
                <Field label="网络">{order.chain}</Field>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>交易对方</SectionLabel>
            <div className="bg-bg border-hairline flex items-center gap-5 rounded-[var(--radius-sm)] border p-4">
              <ScoreRing score={order.counterparty.score} threshold={70} size={76} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{order.counterparty.name}</div>
                <div className="text-muted font-mono text-[12px]">
                  {order.counterparty.displayId}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-y-2 text-[12px]">
                  <Field label="成交">{order.counterparty.completedTrades} 笔</Field>
                  <Field label="纠纷">{order.counterparty.disputes} 次</Field>
                  <Field label="回复">平均 {order.counterparty.avgResponseMin} 分钟</Field>
                  <Field label="实名">
                    {order.counterparty.verified ? (
                      <span className="text-ok">已通过</span>
                    ) : (
                      <span className="text-warn">未完成</span>
                    )}
                  </Field>
                </div>
              </div>
            </div>
          </section>

          <p className="text-muted text-[13px] leading-relaxed">
            确认后 AI 会立刻对这笔交易做一遍安全检查，核对对方的身份、历史记录和收款地址，
            大约需要几秒钟。
          </p>

          {verdict.ok ? (
            <button
              onClick={onConfirm}
              className="bg-brand hover:bg-brand-dim h-12 w-full rounded-[var(--radius-sm)] text-[15px] font-semibold text-[#0b0d12] transition-colors"
            >
              确认接单，开始 AI 检查
            </button>
          ) : (
            // 唯一的失败原因就是账户未开通，所以不做禁用态——直接给出口。死路要有门。
            <div className="space-y-3">
              <p className="text-bad flex items-center gap-2 text-[14px]">
                <span className="bg-bad h-1.5 w-1.5 rounded-full" />
                {verdict.reason}
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate('/desk');
                }}
                className="border-hairline-strong text-txt hover:border-brand hover:text-brand h-12 w-full rounded-[var(--radius-sm)] border text-[15px] font-semibold transition-colors"
              >
                去开通账户
              </button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted mb-2.5 text-[11px] font-semibold tracking-[0.08em]">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted text-[11px]">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
