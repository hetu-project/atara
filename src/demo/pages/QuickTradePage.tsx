import { useMemo, useState } from 'react';
import AiReviewModal from '@/demo/components/AiReviewModal';
import { pickBestMatch } from '@/demo/engine/matching';
import { fmtAmount, fmtFiat } from '@/demo/format';
import DemoPageHeader from '@/demo/layout/DemoPageHeader';
import { FIATS, TRADABLE, decimalsOf, priceOf } from '@/demo/prices';
import { useDemo } from '@/demo/state/useDemo';
import type { DeskKind, PoolOrder } from '@/demo/types';

/** 哪一栏是用户刚输入的，另一栏跟着算。 */
type Edited = 'fiat' | 'asset';

export default function QuickTradePage() {
  const { state } = useDemo();
  const [side, setSide] = useState<DeskKind>('buy');
  const [asset, setAsset] = useState('BTC');
  const [fiat, setFiat] = useState('USD');
  const [fiatAmount, setFiatAmount] = useState('10000');
  const [assetAmount, setAssetAmount] = useState('');
  const [edited, setEdited] = useState<Edited>('fiat');
  const [modalOrder, setModalOrder] = useState<PoolOrder | null>(null);

  const px = priceOf(asset);
  const dp = decimalsOf(asset);

  // 只算「另一栏」，用户正在输入的那栏保持原样，否则光标会被格式化打断。
  const shownFiat = edited === 'fiat' ? fiatAmount : computeFiat(assetAmount, px);
  const shownAsset = edited === 'asset' ? assetAmount : computeAsset(fiatAmount, px, dp);

  const wantAmount = Number(shownAsset) || 0;
  const desk = state.desks[side];

  // AI 从大厅里挑最优对手方。用户只填金额，对手方不用自己找。
  const best = useMemo(
    () => pickBestMatch(state.pool, { asset, fiat, side, amount: wantAmount }),
    [state.pool, asset, fiat, side, wantAmount],
  );

  const candidates = useMemo(
    () => state.pool.filter((o) => o.asset === asset && o.fiatCurrency === fiat && o.side !== side),
    [state.pool, asset, fiat, side],
  );

  const canTrade = wantAmount > 0 && best !== null;

  return (
    <>
      <DemoPageHeader title="快捷兑换" subtitle="输入金额，由 AI 完成对手方匹配与风险审核" />

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* 左侧：AI 匹配结果 */}
        <div className="bg-surface border-hairline flex flex-col rounded-[var(--radius-panel)] border p-[26px]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-muted text-[11px] font-semibold tracking-[0.08em]">AI 匹配结果</div>
              <h2 className="mt-1.5 text-[21px] font-semibold tracking-tight">
                {side === 'buy' ? '买入' : '卖出'} {asset}
              </h2>
            </div>
            {canTrade && (
              <span className="text-brand bg-brand/10 flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 text-[12px] font-medium">
                <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />
                已锁定最优对手方
              </span>
            )}
          </div>

          {!wantAmount ? (
            <Empty text="输入金额后，AI 会从大厅在售挂单中挑出最合适的一笔。" />
          ) : best ? (
            <div className="animate-[fadeUp_.35s_ease-out]">
              <div className="flex items-center gap-3.5">
                <span className="bg-brand/12 text-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold">
                  {best.counterparty.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[17px] font-medium">{best.counterparty.name}</span>
                    {best.counterparty.verified && <span className="text-ok text-[12px]">✓</span>}
                  </div>
                  <div className="text-muted font-mono text-[12px]">
                    {best.counterparty.displayId}
                  </div>
                </div>
                <span className="text-ok bg-ok/12 shrink-0 rounded-[8px] px-2.5 py-1.5 text-[16px] font-semibold tabular-nums">
                  {best.counterparty.score}
                </span>
              </div>

              <div className="border-hairline mt-5 grid grid-cols-3 gap-4 border-t pt-5">
                <Stat label="这笔挂单" value={`${fmtAmount(best.amount)} ${best.asset}`} />
                <Stat label="对价" value={fmtFiat(best.fiatTotal, best.fiatCurrency)} />
                <Stat label="单价" value={fmtAmount(best.price)} />
              </div>
              <div className="border-hairline mt-4 grid grid-cols-3 gap-4 border-t pt-4">
                <Stat label="历史成交" value={`${best.counterparty.completedTrades} 笔`} />
                <Stat label="纠纷" value={`${best.counterparty.disputes} 次`} />
                <Stat label="平均回复" value={`${best.counterparty.avgResponseMin} 分钟`} />
              </div>

              {/* 说清楚 AI 为什么选它——不解释的推荐在产品里就是黑箱 */}
              <div className="bg-bg border-hairline mt-5 rounded-[var(--radius-sm)] border p-4">
                <div className="text-muted mb-2 text-[11px] font-semibold tracking-[0.08em]">
                  为什么是这一笔
                </div>
                <p className="text-[13px] leading-relaxed">{whyThisOne(best, candidates.length)}</p>
              </div>
            </div>
          ) : (
            <Empty
              text={`大厅暂时没有以 ${fiat} 结算的${side === 'buy' ? '出售' : '求购'} ${asset} 挂单，换个币种或结算货币试试。`}
            />
          )}
        </div>

        {/* 右侧：币安式兑换卡 */}
        <div className="bg-surface border-hairline h-fit overflow-hidden rounded-[var(--radius-panel)] border">
          <div className="grid grid-cols-2">
            {(['buy', 'sell'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`relative py-4 text-[15px] font-semibold transition-colors ${
                  side === s ? 'text-txt' : 'text-muted hover:text-txt'
                }`}
              >
                {s === 'buy' ? 'Buy' : 'Sell'}
                <span
                  className={`bg-brand absolute inset-x-0 bottom-0 h-[2px] origin-center transition-transform duration-300 ${
                    side === s ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="border-hairline space-y-3 border-t p-5">
            <MoneyField
              label={side === 'buy' ? 'Spend' : 'Receive'}
              amount={shownFiat}
              onAmount={(v) => {
                setEdited('fiat');
                setFiatAmount(v);
              }}
              unit={fiat}
              units={FIATS}
              onUnit={setFiat}
            />
            <MoneyField
              label={side === 'buy' ? 'Receive' : 'Spend'}
              amount={shownAsset}
              onAmount={(v) => {
                setEdited('asset');
                setAssetAmount(v);
              }}
              unit={asset}
              units={TRADABLE}
              onUnit={setAsset}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              {[1000, 5000, 20000, 100000].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setEdited('fiat');
                    setFiatAmount(String(v));
                  }}
                  className="border-hairline text-muted hover:border-brand hover:text-brand rounded-[var(--radius-pill)] border px-3 py-1 text-[12px] tabular-nums transition-colors"
                >
                  {v.toLocaleString('en-US')}
                </button>
              ))}
            </div>

            <button
              disabled={!canTrade}
              onClick={() => best && setModalOrder(best)}
              className="bg-brand hover:bg-brand-dim text-on-brand mt-2 h-12 w-full rounded-[var(--radius-sm)] text-[15px] font-semibold transition-colors disabled:opacity-35"
            >
              {canTrade ? 'AI 撮合并交易' : '请输入金额'}
            </button>

            <p className="text-muted text-center text-[12px]">
              点击后 AI 会先跑一遍安全检查，由你确认是否成交
            </p>
          </div>
        </div>
      </div>

      {modalOrder && (
        <AiReviewModal
          order={modalOrder}
          desk={desk}
          source="AI 自动撮合"
          onClose={() => setModalOrder(null)}
        />
      )}
    </>
  );
}

function computeAsset(fiatStr: string, px: number, dp: number): string {
  const n = Number(fiatStr);
  if (!n || !isFinite(n)) return '';
  return (n / px).toFixed(dp);
}

function computeFiat(assetStr: string, px: number): string {
  const n = Number(assetStr);
  if (!n || !isFinite(n)) return '';
  return (n * px).toFixed(2);
}

function MoneyField({
  label,
  amount,
  onAmount,
  unit,
  units,
  onUnit,
}: {
  label: string;
  amount: string;
  onAmount: (v: string) => void;
  unit: string;
  units: string[];
  onUnit: (v: string) => void;
}) {
  return (
    <div className="bg-bg border-hairline focus-within:border-brand rounded-[var(--radius-sm)] border px-4 py-3 transition-colors">
      <div className="text-muted mb-1 text-[12px]">{label}</div>
      <div className="flex items-center gap-3">
        <input
          value={amount}
          onChange={(e) => onAmount(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          placeholder="0.00"
          className="text-txt placeholder:text-muted min-w-0 flex-1 bg-transparent text-[24px] font-semibold tabular-nums outline-none"
        />
        <select
          value={unit}
          onChange={(e) => onUnit(e.target.value)}
          className="border-hairline bg-surface text-txt hover:border-hairline-strong shrink-0 rounded-[var(--radius-pill)] border px-3 py-1.5 text-[14px] font-medium outline-none transition-colors"
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border-hairline text-muted flex flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-dashed px-6 py-14 text-center text-[13px]">
      {text}
    </div>
  );
}

/** AI 的选单理由。由实际数据算出，不写死。 */
function whyThisOne(best: PoolOrder, candidateCount: number): string {
  const cp = best.counterparty;
  const bits: string[] = [];
  // 「在 1 笔挂单中信用分最高」是句废话，候选只有一笔时换个说法
  bits.push(
    candidateCount > 1
      ? `在 ${candidateCount} 笔同币种同结算货币的挂单中信用分最高（${cp.score}）`
      : `当前唯一一笔同币种同结算货币的挂单，对手方信用分 ${cp.score}`,
  );
  if (cp.disputes === 0) bits.push(`${cp.completedTrades} 笔履约零纠纷`);
  else bits.push(`${cp.completedTrades} 笔履约、${cp.disputes} 次纠纷已了结`);
  if (cp.avgResponseMin <= 10) bits.push(`平均 ${cp.avgResponseMin} 分钟内回复`);
  if (cp.verified) bits.push('已完成实名认证');
  return bits.join('，') + '。';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted text-[11px]">{label}</div>
      <div className="mt-1 truncate font-medium tabular-nums">{value}</div>
    </div>
  );
}
