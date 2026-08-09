import { useState } from 'react';
import { useNavigate } from 'react-router';
import Drawer from '@/demo/components/Drawer';
import ScoreRing from '@/demo/components/ScoreRing';
import { matchOrder } from '@/demo/engine/matching';
import { fmtAmount, fmtFiat } from '@/demo/format';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';
import { useDemo } from '@/demo/state/useDemo';
import type { Desk, PoolOrder, Transaction } from '@/demo/types';

export default function MatchDrawer({
  order,
  desk,
  onClose,
}: {
  order: PoolOrder | null;
  desk: Desk;
  onClose: () => void;
}) {
  const { dispatch } = useDemo();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [merging, setMerging] = useState(false);

  const verdict = matchOrder(desk);

  function confirm() {
    if (!order) return;

    const commit = () => {
      const tx: Transaction = {
        id: `tx_${Date.now().toString(36)}`,
        poolOrderId: order.id,
        side: desk.kind,
        asset: order.asset,
        amount: order.amount,
        fiatTotal: order.fiatTotal,
        fiatCurrency: order.fiatCurrency,
        counterparty: order.counterparty,
        status: 'queued',
        createdAt: new Date().toISOString(),
        risk: null,
        resubmits: 0,
      };
      dispatch({ type: 'match', order, tx });
      onClose();
      setMerging(false);
      navigate('/queue');
    };

    if (reduced) return commit();
    setMerging(true);
    setTimeout(commit, 950);
  }

  return (
    <Drawer open={order !== null} onClose={onClose} title="撮合确认">
      {order && (merging ? <Merging order={order} desk={desk} /> : null)}
      {order && !merging && (
        <div className="space-y-6">
          <section>
            <SectionLabel>挂单</SectionLabel>
            <div className="bg-bg border-hairline rounded-[var(--radius-sm)] border p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[13px]">{order.id}</span>
                <span className="text-muted text-[12px]">
                  {order.side === 'sell' ? '对手方卖出' : '对手方买入'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-3 text-[13px]">
                <Field label="资产">
                  {order.asset} <span className="text-muted">· {order.chain}</span>
                </Field>
                <Field label="数量">{fmtAmount(order.amount)}</Field>
                <Field label="单价">{fmtFiat(order.price, order.fiatCurrency)}</Field>
                <Field label="对价">{fmtFiat(order.fiatTotal, order.fiatCurrency)}</Field>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>对手方</SectionLabel>
            <div className="bg-bg border-hairline flex items-center gap-5 rounded-[var(--radius-sm)] border p-4">
              <ScoreRing score={order.counterparty.score} threshold={70} size={76} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{order.counterparty.name}</div>
                <div className="text-muted font-mono text-[12px]">
                  {order.counterparty.displayId}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-y-2 text-[12px]">
                  <Field label="成交">{order.counterparty.completedTrades} 笔</Field>
                  <Field label="争议">{order.counterparty.disputes} 起</Field>
                  <Field label="响应">中位 {order.counterparty.avgResponseMin} 分钟</Field>
                  <Field label="实名">
                    {order.counterparty.verified ? (
                      <span className="text-ok">已验证</span>
                    ) : (
                      <span className="text-warn">未验证</span>
                    )}
                  </Field>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>初判</SectionLabel>
            {verdict.ok ? (
              <p className="text-ok flex items-center gap-2 text-[14px]">
                <span className="bg-ok h-1.5 w-1.5 rounded-full" />
                以「{desk.name}」可撮合
              </p>
            ) : (
              <p className="text-bad flex items-center gap-2 text-[14px]">
                <span className="bg-bad h-1.5 w-1.5 rounded-full" />
                {verdict.reason}
              </p>
            )}
          </section>

          {verdict.ok ? (
            <button
              onClick={confirm}
              className="bg-brand hover:bg-brand-dim h-11 w-full rounded-[var(--radius-sm)] text-[14px] font-semibold text-[#0b0d12] transition-colors"
            >
              确认撮合
            </button>
          ) : (
            // 唯一的失败原因就是席位未开通，所以不做禁用态——直接给出口。死路要有门。
            <button
              onClick={() => {
                onClose();
                navigate('/desk');
              }}
              className="border-hairline-strong text-txt hover:border-brand hover:text-brand h-11 w-full rounded-[var(--radius-sm)] border text-[14px] font-semibold transition-colors"
            >
              去开通席位
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}

/** 撮合动画：两张卡向中间汇聚合并。 */
function Merging({ order, desk }: { order: PoolOrder; desk: Desk }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 py-20">
      <div className="relative flex w-full items-center justify-center">
        <Card className="animate-[mergeLeft_.9s_cubic-bezier(.4,0,.2,1)_forwards]" title={desk.name}>
          {desk.displayId}
        </Card>
        <Card
          className="animate-[mergeRight_.9s_cubic-bezier(.4,0,.2,1)_forwards]"
          title={order.counterparty.name}
        >
          {order.counterparty.displayId}
        </Card>
      </div>
      <div className="text-muted animate-pulse text-[13px]">正在撮合…</div>
      <div className="text-[13px]">
        {fmtAmount(order.amount)} {order.asset} ·{' '}
        {fmtFiat(order.fiatTotal, order.fiatCurrency)}
      </div>
    </div>
  );
}

function Card({
  children,
  title,
  className,
}: {
  children: React.ReactNode;
  title: string;
  className: string;
}) {
  return (
    <div
      className={`bg-surface-raised border-hairline-strong absolute w-[190px] rounded-[var(--radius-sm)] border p-4 text-center ${className}`}
    >
      <div className="truncate text-[13px] font-medium">{title}</div>
      <div className="text-muted mt-1 font-mono text-[11px]">{children}</div>
    </div>
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
