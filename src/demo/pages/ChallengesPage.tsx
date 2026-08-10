import { useState } from 'react';
import DataTable, { type Column } from '@/demo/components/DataTable';
import Drawer from '@/demo/components/Drawer';
import FilterBar from '@/demo/components/FilterBar';
import KpiTile from '@/demo/components/KpiTile';
import StatusBadge from '@/demo/components/StatusBadge';
import { fmtAmount, fmtFiat, fmtTime, timeAgo } from '@/demo/format';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';

const COLUMNS: Column[] = [
  { key: 'created', label: '时间', width: '15%' },
  { key: 'state', label: '状态', width: '12%' },
  { key: 'reason', label: 'AI 发现的问题', width: '36%' },
  { key: 'required', label: '需要你提供', width: '25%' },
  { key: 'tx', label: '交易单号', width: '12%' },
];

export default function ChallengesPage() {
  const { state, dispatch } = useDemo();
  const [openId, setOpenId] = useState<string | null>(null);

  const challenges = state.challenges;
  const open = challenges.filter((c) => c.state === 'open').length;
  const resolved = challenges.filter((c) => c.state === 'resolved').length;
  const detail = challenges.find((c) => c.id === openId) ?? null;
  const detailTx = detail ? state.transactions.find((t) => t.id === detail.txId) : undefined;

  return (
    <>
      <DemoPageHeader
        title="待我处理"
        subtitle="AI 觉得有疑点的交易，补齐材料后会重新检查"
        actions={
          <>
            <HeaderButton>导出 CSV</HeaderButton>
            <HeaderButton>文档</HeaderButton>
          </>
        }
      />

      <div className="mb-[18px] grid grid-cols-4 gap-[18px]">
        <KpiTile label="全部" value={challenges.length} sub="需要关注的交易" />
        <KpiTile label="等你处理" value={open} accent="warn" sub="补齐材料即可继续" />
        <KpiTile label="重新检查中" value={resolved} sub="材料已提交" />
        <KpiTile label="即将过期" value={0} sub="24 小时内" />
      </div>

      <FilterBar summary="显示全部" loaded={challenges.length} />

      <DataTable
        columns={COLUMNS}
        empty="太好了，没有需要你处理的事。"
        onRowClick={setOpenId}
        rows={challenges.map((c) => ({
          id: c.id,
          cells: [
            <div key="t">
              <div className="text-muted tabular-nums">{fmtTime(c.openedAt)}</div>
              <div className="text-muted mt-0.5 text-[11px]">{timeAgo(c.openedAt)}</div>
            </div>,
            <StatusBadge key="s" status={c.state} />,
            <span key="r" className="text-[13px]">
              {c.reason}
            </span>,
            <span key="q" className="text-muted text-[12px]">
              {c.required.join(' · ')}
            </span>,
            <span key="tx" className="font-mono text-[12px]">
              {c.txId}
            </span>,
          ],
        }))}
      />

      <Drawer open={detail !== null} onClose={() => setOpenId(null)} title="需要你补充的材料">
        {detail && (
          <div className="space-y-6">
            {detailTx && (
              <div className="bg-bg border-hairline rounded-[var(--radius-sm)] border p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[13px]">{detailTx.id}</span>
                  <StatusBadge status={detailTx.status} />
                </div>
                <div className="mt-2 text-[14px]">
                  {fmtAmount(detailTx.amount)} {detailTx.asset}
                  <span className="text-muted mx-2">·</span>
                  {fmtFiat(detailTx.fiatTotal, detailTx.fiatCurrency)}
                </div>
                <div className="text-muted mt-1 text-[12px]">{detailTx.counterparty.name}</div>
              </div>
            )}

            <section>
              <Label>AI 发现的问题</Label>
              <p className="text-warn text-[14px]">{detail.reason}</p>
            </section>

            <section>
              <Label>需要你提供</Label>
              <ul className="space-y-2.5">
                {detail.required.map((r) => (
                  <li key={r} className="flex items-center gap-3 text-[13px]">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] ${
                        detail.state === 'resolved'
                          ? 'border-ok bg-ok text-on-brand'
                          : 'border-hairline-strong'
                      }`}
                    >
                      {detail.state === 'resolved' ? '✓' : ''}
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-3 text-[12px]">
                演示环境不做真实上传，点下方按钮即视为材料齐备。
              </p>
            </section>

            {detail.state === 'open' ? (
              <button
                onClick={() => {
                  dispatch({ type: 'resolveChallenge', challengeId: detail.id });
                  setOpenId(null);
                }}
                className="bg-brand hover:bg-brand-dim h-11 w-full rounded-[var(--radius-sm)] text-[14px] font-semibold text-on-brand transition-colors"
              >
                补充材料并重新提交
              </button>
            ) : (
              <p className="text-ok text-center text-[13px]">
                材料已提交，AI 正在重新检查这笔交易
              </p>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted mb-2.5 text-[11px] font-semibold tracking-[0.08em]">{children}</div>
  );
}
