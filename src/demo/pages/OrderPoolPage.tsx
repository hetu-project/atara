import { useMemo, useRef, useState } from 'react';
import KpiTile from '@/demo/components/KpiTile';
import MatchCeremony from '@/demo/components/MatchCeremony';
import MatchDrawer from '@/demo/components/MatchDrawer';
import OrderCard from '@/demo/components/OrderCard';
import { matchOrder } from '@/demo/engine/matching';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';
import type { DeskKind, PoolOrder } from '@/demo/types';

export default function OrderPoolPage() {
  const { state } = useDemo();
  const [deskKind, setDeskKind] = useState<DeskKind>('buy');
  const [side, setSide] = useState<'all' | DeskKind>('all');
  const [asset, setAsset] = useState('all');
  const [picked, setPicked] = useState<PoolOrder | null>(null);
  const [ceremony, setCeremony] = useState<PoolOrder | null>(null);

  const desk = state.desks[deskKind];
  const canMatch = matchOrder(desk).ok;

  // 判断哪张卡是刚滑入的新单：记住上次渲染的首个 id，变了就给新首卡加一次动画。
  const lastTop = useRef<string | null>(null);
  const topId = state.pool[0]?.id ?? null;
  const newId = topId !== lastTop.current ? topId : null;
  lastTop.current = topId;

  const orders = useMemo(
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
        title="交易大厅"
        subtitle="挑一笔别人挂出的单，点确认就自动成交"
        actions={<HeaderButton>文档</HeaderButton>}
      />

      <div className="mb-[18px] grid grid-cols-3 gap-[18px]">
        <KpiTile label="在售挂单" value={state.pool.length} sub="每几秒就有新单进来" />
        <KpiTile
          label="你能接的"
          value={canMatch ? orders.length : 0}
          accent={canMatch ? 'brand' : 'bad'}
          sub={canMatch ? `用${desk.name}` : `${desk.name}还没开通`}
        />
        <KpiTile label="平均挂出时长" value={`${avgAgeMin} 分钟`} sub="全部在售挂单" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select
          label="用哪个账户"
          value={deskKind}
          onChange={(v) => setDeskKind(v as DeskKind)}
          options={[
            { v: 'buy', t: '买入账户' },
            { v: 'sell', t: '卖出账户' },
          ]}
        />
        <Select
          label="类型"
          value={side}
          onChange={(v) => setSide(v as 'all' | DeskKind)}
          options={[
            { v: 'all', t: '全部' },
            { v: 'sell', t: '对方出售' },
            { v: 'buy', t: '对方求购' },
          ]}
        />
        <Select
          label="币种"
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
        <span className="text-muted ml-auto text-[13px] tabular-nums">
          {orders.length} 笔在售
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="border-hairline text-muted flex h-[240px] items-center justify-center rounded-[var(--radius-panel)] border border-dashed text-[14px]">
          没有符合条件的挂单，换个筛选条件试试。
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px]">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              isNew={o.id === newId}
              onPick={() => setPicked(o)}
            />
          ))}
        </div>
      )}

      <MatchDrawer
        order={picked}
        desk={desk}
        onClose={() => setPicked(null)}
        onConfirm={() => {
          setCeremony(picked);
          setPicked(null);
        }}
      />

      {ceremony && (
        <MatchCeremony order={ceremony} desk={desk} onClose={() => setCeremony(null)} />
      )}
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
