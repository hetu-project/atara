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
    () => pickBestMatch(state.pool, { asset, side, amount: wantAmount }),
    [state.pool, asset, side, wantAmount],
  );

  const canTrade = wantAmount > 0 && best !== null;

  return (
    <>
      <DemoPageHeader title="快捷兑换" subtitle="填个金额，AI 自动帮你找最优对手方" />

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* 左侧：说明 + AI 匹配结果 */}
        <div className="flex flex-col gap-[18px]">
          <div className="bg-surface border-hairline rounded-[var(--radius-panel)] border p-[26px]">
            <h2 className="text-[30px] leading-tight font-semibold tracking-tight">
              {side === 'buy' ? '买入' : '卖出'} {asset}
              <span className="text-muted">，用 {fiat}</span>
            </h2>
            <p className="text-muted mt-3 text-[14px] leading-relaxed">
              不用去大厅一张张翻。填好金额，AI 会在当前 {state.pool.length} 笔在售挂单里
              按对手方信用和金额匹配度挑出最合适的一笔，成交前照例跑一遍安全检查。
            </p>

            <div className="border-hairline mt-6 grid grid-cols-3 gap-4 border-t pt-5 text-[13px]">
              <Stat label="参考单价" value={`${fmtAmount(px)} ${fiat}`} />
              <Stat label="在售挂单" value={`${state.pool.length} 笔`} />
              <Stat label="使用账户" value={desk.name} />
            </div>
          </div>

          {/* AI 匹配结果 */}
          <div className="bg-surface border-hairline rounded-[var(--radius-panel)] border p-[22px]">
            <div className="text-muted mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em]">
              AI 匹配结果
              {canTrade && <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />}
            </div>

            {!wantAmount ? (
              <p className="text-muted text-[13px]">填入金额后，AI 会立刻给出匹配的对手方。</p>
            ) : best ? (
              <div className="animate-[fadeUp_.35s_ease-out]">
                <div className="flex items-center gap-3">
                  <span className="bg-brand/12 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold">
                    {best.counterparty.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium">
                        {best.counterparty.name}
                      </span>
                      {best.counterparty.verified && <span className="text-ok text-[11px]">✓</span>}
                    </div>
                    <div className="text-muted text-[12px]">
                      成交 {best.counterparty.completedTrades} 笔 · 纠纷{' '}
                      {best.counterparty.disputes} 次
                    </div>
                  </div>
                  <span className="text-ok bg-ok/12 shrink-0 rounded-[6px] px-2 py-1 text-[13px] font-semibold tabular-nums">
                    {best.counterparty.score}
                  </span>
                </div>
                <div className="border-hairline mt-3.5 grid grid-cols-3 gap-3 border-t pt-3.5 text-[13px]">
                  <Stat label="这笔挂单" value={`${fmtAmount(best.amount)} ${best.asset}`} />
                  <Stat label="对价" value={fmtFiat(best.fiatTotal, best.fiatCurrency)} />
                  <Stat label="单价" value={fmtAmount(best.price)} />
                </div>
              </div>
            ) : (
              <p className="text-warn text-[13px]">
                当前大厅里没有{side === 'buy' ? '出售' : '求购'} {asset} 的挂单，换个币种试试。
              </p>
            )}
          </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted text-[11px]">{label}</div>
      <div className="mt-1 truncate font-medium tabular-nums">{value}</div>
    </div>
  );
}
