import { useEffect, useRef, useState } from 'react';
import DataTable, { type Column } from '@/demo/components/DataTable';
import Drawer from '@/demo/components/Drawer';
import FilterBar from '@/demo/components/FilterBar';
import KpiTile from '@/demo/components/KpiTile';
import ReasoningPanel from '@/demo/components/ReasoningPanel';
import StatusBadge from '@/demo/components/StatusBadge';
import { challengeFromRisk } from '@/demo/engine/challenge';
import { assessRisk } from '@/demo/engine/riskEngine';
import { nextStatus } from '@/demo/engine/queueMachine';
import { fmtAmount, fmtFiat, fmtTime } from '@/demo/format';
import { streamingDurationMs } from '@/demo/hooks/useStreamingChecks';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';
import type { RiskResult } from '@/demo/types';

const COLUMNS: Column[] = [
  { key: 'created', label: '时间', width: '14%' },
  { key: 'tx', label: '交易单号', width: '19%' },
  { key: 'status', label: '状态', width: '12%' },
  { key: 'risk', label: '安全评分', width: '17%' },
  { key: 'amount', label: '金额', width: '18%', align: 'right' },
  { key: 'cp', label: '交易对方', width: '20%' },
];

export default function QueuePage() {
  const { state, dispatch } = useDemo();
  const [openId, setOpenId] = useState<string | null>(null);
  // 已经安排过定时器的交易，避免重复排程
  const scheduled = useRef(new Set<string>());

  // queued 的交易 1 秒后进入校验
  useEffect(() => {
    const timers = state.transactions
      .filter((t) => t.status === 'queued' && !scheduled.current.has(`start:${t.id}`))
      .map((t) => {
        scheduled.current.add(`start:${t.id}`);
        return setTimeout(() => {
          const next = nextStatus('queued', 'start');
          if (next) dispatch({ type: 'setTxStatus', txId: t.id, status: next });
        }, 1000);
      });
    return () => timers.forEach(clearTimeout);
  }, [state.transactions, dispatch]);

  // validating 且还没有 risk 的：算一份存下来，并安排流式跑完后的裁决落地
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const t of state.transactions) {
      if (t.status !== 'validating' || t.risk !== null) continue;
      const key = `risk:${t.id}:${t.resubmits}`;
      if (scheduled.current.has(key)) continue;
      scheduled.current.add(key);

      const risk: RiskResult = assessRisk(t);
      dispatch({ type: 'setTxRisk', txId: t.id, risk });

      timers.push(
        setTimeout(() => {
          const event =
            risk.verdict === 'pass' ? 'pass' : risk.verdict === 'challenge' ? 'challenge' : 'decline';
          const next = nextStatus('validating', event);
          if (!next) return;
          dispatch({ type: 'setTxStatus', txId: t.id, status: next });

          if (risk.verdict === 'challenge') {
            dispatch({
              type: 'openChallenge',
              challenge: challengeFromRisk(
                `ch_${t.id}_${t.resubmits}`,
                t.id,
                risk,
                new Date().toISOString(),
              ),
            });
          }
        }, streamingDurationMs(risk.checks.length)),
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [state.transactions, dispatch]);

  const txs = state.transactions;
  const count = (s: string) => txs.filter((t) => t.status === s).length;
  const live = txs.filter((t) => t.status === 'queued' || t.status === 'validating').length;
  const open = txs.find((t) => t.id === openId) ?? null;

  return (
    <>
      <DemoPageHeader
        title="我的交易"
        subtitle="成交后的每一笔都会在这里经过 AI 安全检查"
        actions={
          <>
            <HeaderButton>导出 CSV</HeaderButton>
            <HeaderButton>文档</HeaderButton>
          </>
        }
      />

      <div className="mb-[18px] grid grid-cols-4 gap-[18px]">
        <KpiTile label="进行中" value={live} accent="brand" sub="尚未出结果" />
        <KpiTile label="排队中" value={count('queued')} sub="等待开始检查" />
        <KpiTile label="AI 审核中" value={count('validating')} sub="正在逐项检查" />
        <KpiTile label="待补材料" value={count('challenged')} sub="需要你处理" />
      </div>

      <FilterBar summary="显示全部交易" loaded={txs.length} />

      <DataTable
        columns={COLUMNS}
        empty="还没有交易。去交易大厅接一单试试。"
        onRowClick={setOpenId}
        rows={txs.map((t) => ({
          id: t.id,
          cells: [
            <span key="c" className="text-muted tabular-nums">
              {fmtTime(t.createdAt)}
            </span>,
            <div key="tx">
              <div className="font-mono text-[12px]">{t.id}</div>
              <div className="text-muted mt-0.5 text-[11px]">
                {t.asset} · {t.side === 'buy' ? '买入' : '卖出'}
              </div>
            </div>,
            <div key="s">
              <StatusBadge status={t.status} />
              {t.status === 'validating' && (
                <div className="bg-hairline mt-2 h-[2px] w-full overflow-hidden rounded-full">
                  <div
                    className="bg-info h-full rounded-full"
                    style={{
                      animation: `grow ${streamingDurationMs(6)}ms linear forwards`,
                    }}
                  />
                </div>
              )}
            </div>,
            <span key="r">
              {t.risk ? (
                <span className="flex items-center gap-2">
                  <span
                    className={`tabular-nums ${
                      t.risk.score >= t.risk.threshold
                        ? 'text-ok'
                        : t.risk.score >= 50
                          ? 'text-warn'
                          : 'text-bad'
                    }`}
                  >
                    {t.risk.score}
                  </span>
                  <span className="bg-hairline h-1 w-16 overflow-hidden rounded-full">
                    <span
                      className={`block h-full rounded-full ${
                        t.risk.score >= t.risk.threshold
                          ? 'bg-ok'
                          : t.risk.score >= 50
                            ? 'bg-warn'
                            : 'bg-bad'
                      }`}
                      style={{ width: `${t.risk.score}%` }}
                    />
                  </span>
                </span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </span>,
            <span key="a" className="tabular-nums">
              {fmtAmount(t.amount)} {t.asset}
              <div className="text-muted mt-0.5 text-[11px] tabular-nums">
                {fmtFiat(t.fiatTotal, t.fiatCurrency)}
              </div>
            </span>,
            <div key="cp">
              <div className="truncate">{t.counterparty.name}</div>
              <div className="text-muted mt-0.5 font-mono text-[11px]">
                {t.counterparty.displayId}
              </div>
            </div>,
          ],
        }))}
      />

      <Drawer open={open !== null} onClose={() => setOpenId(null)} title="交易详情">
        {open && <ReasoningPanel tx={open} />}
      </Drawer>
    </>
  );
}
