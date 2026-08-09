import { useMemo, useRef, useState } from 'react';
import DataTable, { type Column } from '@/demo/components/DataTable';
import FilterBar from '@/demo/components/FilterBar';
import KpiTile from '@/demo/components/KpiTile';
import MatchDrawer from '@/demo/components/MatchDrawer';
import { matchOrder } from '@/demo/engine/matching';
import { fmtAmount, fmtFiat, timeAgo } from '@/demo/format';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';
import type { DeskKind, PoolOrder } from '@/demo/types';

const COLUMNS: Column[] = [
  { key: 'id', label: '挂单', width: '17%' },
  { key: 'side', label: '方向', width: '9%' },
  { key: 'asset', label: '资产', width: '13%' },
  { key: 'amount', label: '数量', width: '13%', align: 'right' },
  { key: 'fiat', label: '对价', width: '17%', align: 'right' },
  { key: 'cp', label: '对手方', width: '21%' },
  { key: 'act', label: '', width: '10%', align: 'right' },
];

export default function OrderPoolPage() {
  const { state } = useDemo();
  const [deskKind, setDeskKind] = useState<DeskKind>('buy');
  const [side, setSide] = useState<'all' | DeskKind>('all');
  const [asset, setAsset] = useState('all');
  const [selected, setSelected] = useState<PoolOrder | null>(null);

  const desk = state.desks[deskKind];
  const canMatch = matchOrder(desk).ok;

  // 判断哪一行是刚滑入的新单：记住上次渲染的首行 id，变了就给新首行加一次动画。
  const lastTop = useRef<string | null>(null);
  const topId = state.pool[0]?.id ?? null;
  const newId = topId !== lastTop.current ? topId : null;
  lastTop.current = topId;

  const rows = useMemo(
    () =>
      state.pool
        .filter((o) => (side === 'all' ? true : o.side === side))
        .filter((o) => (asset === 'all' ? true : o.asset === asset)),
    [state.pool, side, asset],
  );

  const avgAgeMin = state.pool.length
    ? Math.round(
        state.pool.reduce((s, o) => s + (Date.now() - new Date(o.postedAt).getTime()), 0) /
          state.pool.length /
          60000,
      )
    : 0;

  return (
    <>
      <DemoPageHeader
        title="订单池"
        subtitle="从池中挑一笔挂单，系统自动撮合"
        actions={
          <>
            <HeaderButton>导出 CSV</HeaderButton>
            <HeaderButton>文档</HeaderButton>
          </>
        }
      />

      <div className="mb-[18px] grid grid-cols-3 gap-[18px]">
        <KpiTile label="池中挂单" value={state.pool.length} sub="实时更新" />
        <KpiTile
          label="可撮合"
          value={canMatch ? rows.length : 0}
          accent={canMatch ? 'brand' : 'bad'}
          sub={canMatch ? `以${desk.name}` : '席位未开通'}
        />
        <KpiTile label="平均挂单时长" value={`${avgAgeMin} 分钟`} sub="池内全部挂单" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          label="撮合席位"
          value={deskKind}
          onChange={(v) => setDeskKind(v as DeskKind)}
          options={[
            { v: 'buy', t: '买方席位' },
            { v: 'sell', t: '卖方席位' },
          ]}
        />
        <Select
          label="方向"
          value={side}
          onChange={(v) => setSide(v as 'all' | DeskKind)}
          options={[
            { v: 'all', t: '全部' },
            { v: 'sell', t: '卖单' },
            { v: 'buy', t: '买单' },
          ]}
        />
        <Select
          label="资产"
          value={asset}
          onChange={setAsset}
          options={[
            { v: 'all', t: '全部' },
            { v: 'USDT', t: 'USDT' },
            { v: 'USDC', t: 'USDC' },
            { v: 'BTC', t: 'BTC' },
            { v: 'ETH', t: 'ETH' },
          ]}
        />
        {!canMatch && (
          <span className="text-warn text-[13px]">
            {desk.name}尚未开通，撮合会提示去开通
          </span>
        )}
      </div>

      <FilterBar
        summary={side === 'all' && asset === 'all' ? '未应用挂单筛选' : '已应用筛选'}
        loaded={rows.length}
      />

      <DataTable
        columns={COLUMNS}
        empty="池中暂无符合条件的挂单"
        onRowClick={(id) => setSelected(rows.find((o) => o.id === id) ?? null)}
        rows={rows.map((o) => ({
          id: o.id,
          isNew: o.id === newId,
          cells: [
            <div key="id">
              <div className="font-mono text-[12px]">{o.id}</div>
              <div className="text-muted mt-0.5 text-[11px]">{timeAgo(o.postedAt)}</div>
            </div>,
            <span
              key="side"
              className={o.side === 'sell' ? 'text-ok text-[13px]' : 'text-info text-[13px]'}
            >
              {o.side === 'sell' ? '卖单' : '买单'}
            </span>,
            <div key="asset">
              <div>{o.asset}</div>
              <div className="text-muted mt-0.5 text-[11px]">{o.chain}</div>
            </div>,
            <span key="amt" className="tabular-nums">
              {fmtAmount(o.amount)}
            </span>,
            <div key="fiat">
              <div className="tabular-nums">{fmtFiat(o.fiatTotal, o.fiatCurrency)}</div>
              <div className="text-muted mt-0.5 text-[11px] tabular-nums">
                @ {fmtAmount(o.price)}
              </div>
            </div>,
            <div key="cp" className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1">
                <div className="truncate">{o.counterparty.name}</div>
                <div className="text-muted mt-0.5 font-mono text-[11px]">
                  {o.counterparty.displayId}
                </div>
              </span>
              <span
                className={`rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                  o.counterparty.score >= 80
                    ? 'text-ok bg-ok/12'
                    : o.counterparty.score >= 65
                      ? 'text-warn bg-warn/12'
                      : 'text-bad bg-bad/12'
                }`}
              >
                {o.counterparty.score}
              </span>
            </div>,
            <span
              key="act"
              className="text-brand hover:text-brand-dim text-[13px] font-medium transition-colors"
            >
              撮合 →
            </span>,
          ],
        }))}
      />

      <MatchDrawer order={selected} desk={desk} onClose={() => setSelected(null)} />
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; t: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-hairline bg-surface text-txt hover:border-hairline-strong focus:border-brand h-[34px] rounded-[var(--radius-xs)] border px-2.5 outline-none transition-colors"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} className="bg-surface">
            {o.t}
          </option>
        ))}
      </select>
    </label>
  );
}
