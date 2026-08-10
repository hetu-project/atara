import { useMemo, useState } from 'react';
import AiReviewModal from '@/demo/components/AiReviewModal';
import { pickBestMatch } from '@/demo/engine/matching';
import DemoPageHeader from '@/demo/layout/DemoPageHeader';
import { FIATS, TRADABLE, decimalsOf, priceOf } from '@/demo/prices';
import { useDemo } from '@/demo/state/useDemo';
import type { DeskKind, PoolOrder } from '@/demo/types';

/** 哪一栏是用户刚输入的，另一栏跟着算。 */
type Edited = 'fiat' | 'asset';

/**
 * 快捷交易。整页只有一张兑换卡——填金额、选币种，剩下的交给 AI。
 *
 * 对手方不在这一屏展示：选了谁、为什么选它，都放到点按钮后的 AI 审核弹窗里讲。
 * 把匹配结果也铺在页面上，这一屏就成了一张说明书，而不是一个能下单的地方。
 */
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

  // AI 从大厅里挑最优对手方。用户不用自己找，也不用在这页看到是谁。
  const best = useMemo(
    () => pickBestMatch(state.pool, { asset, fiat, side, amount: wantAmount }),
    [state.pool, asset, fiat, side, wantAmount],
  );

  const canTrade = wantAmount > 0 && best !== null;

  return (
    <>
      <DemoPageHeader title="快捷交易" subtitle="输入金额，由 AI 完成对手方匹配与风险审核" />

      <div className="mx-auto w-full max-w-[460px]">
        <div className="bg-surface border-hairline overflow-hidden rounded-[var(--radius-panel)] border">
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
              {wantAmount <= 0 ? '请输入金额' : canTrade ? 'AI 撮合并交易' : '暂无可撮合的挂单'}
            </button>

            <p className="text-muted text-center text-[12px]">
              {wantAmount > 0 && !best
                ? `大厅暂时没有以 ${fiat} 结算的${side === 'buy' ? '出售' : '求购'} ${asset} 挂单`
                : '点击后 AI 会匹配对手方并跑一遍安全检查，由你确认是否成交'}
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
