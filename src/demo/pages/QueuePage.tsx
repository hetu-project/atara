import { useEffect, useRef, useState } from 'react';
import DataTable, { type Column } from '@/demo/components/DataTable';
import Drawer from '@/demo/components/Drawer';
import FilterBar from '@/demo/components/FilterBar';
import KpiTile from '@/demo/components/KpiTile';
import ReasoningPanel from '@/demo/components/ReasoningPanel';
import StatusBadge from '@/demo/components/StatusBadge';
import { assessRisk } from '@/demo/engine/riskEngine';
import { nextStatus } from '@/demo/engine/queueMachine';
import { fmtAmount, fmtFiat, fmtTime } from '@/demo/format';
import { streamingDurationMs } from '@/demo/hooks/useStreamingChecks';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';
import type { RiskResult } from '@/demo/types';

const COLUMNS: Column[] = [
  { key: 'created', label: '创建时间', width: '14%' },
  { key: 'tx', label: '交易', width: '19%' },
  { key: 'status', label: '状态', width: '12%' },
  { key: 'risk', label: '裁决 / 风险', width: '17%' },
  { key: 'amount', label: '金额', width: '18%', align: 'right' },
  { key: 'cp', label: '对手方', width: '20%' },
];

/** 挑战要求补充的材料，按第一条非 pass 的检查项给。 */
const REQUIRED: Record<string, string[]> = {
  kyc: ['对手方实名证件', '席位授权书'],
  history: ['近三个月成交流水', '争议处理说明'],
  sanctions: ['地址归属说明', '合规意见书'],
  amount: ['资金来源证明', '交易背景说明'],
  response: ['联系人确认函'],
  tenure: ['账户开立证明'],
};

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
            const flaw = risk.checks.find((c) => c.status !== 'pass');
            dispatch({
              type: 'openChallenge',
              challenge: {
                id: `ch_${t.id}_${t.resubmits}`,
                txId: t.id,
                reason: flaw ? `${flaw.label}：${flaw.detail}` : '风控评分低于阈值',
                required: (flaw && REQUIRED[flaw.id]) ?? ['补充交易背景说明'],
                state: 'open',
                openedAt: new Date().toISOString(),
              },
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
        title="队列"
        subtitle="撮合后的交易在这里逐笔通过风控"
        actions={
          <>
            <HeaderButton>导出 CSV</HeaderButton>
            <HeaderButton>文档</HeaderButton>
          </>
        }
      />

      <div className="mb-[18px] grid grid-cols-4 gap-[18px]">
        <KpiTile label="LIVE TASKS" value={live} accent="brand" sub="进行中的交易" />
        <KpiTile label="QUEUING" value={count('queued')} sub="等待开始" />
        <KpiTile label="VALIDATING" value={count('validating')} sub="风控校验中" />
        <KpiTile label="CHALLENGING" value={count('challenged')} sub="等待补充材料" />
      </div>

      <FilterBar summary="未应用交易筛选" loaded={txs.length} />

      <DataTable
        columns={COLUMNS}
        empty="队列中还没有交易。去订单池撮合一笔。"
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
