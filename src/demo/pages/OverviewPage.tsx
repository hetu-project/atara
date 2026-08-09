import KpiTile from '@/demo/components/KpiTile';
import Sparkline from '@/demo/components/Sparkline';
import { seededRandom } from '@/demo/random';
import { fmtTime } from '@/demo/format';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';

const RANGES = ['24h', '7d', '30d', '自定义范围'];

/** 图表数据由固定种子生成，每次演示形状一致。 */
function series(name: string, n = 24): number[] {
  const r = seededRandom(`chart_${name}`);
  let v = 40 + r() * 30;
  return Array.from({ length: n }, () => {
    v = Math.max(6, Math.min(100, v + (r() - 0.45) * 22));
    return v;
  });
}

const CHARTS = [
  { key: 'volume', label: 'VOLUME', title: '撮合量', sub: '按时间桶统计的提交与成交', color: '#8ee6c9' },
  { key: 'score', label: 'STATUS', title: '评分分布', sub: '终态与后续状态的构成', color: '#a8c1ff' },
  { key: 'challenge', label: 'CHALLENGE', title: '挡单趋势', sub: '挡单生命周期状态', color: '#f1b991' },
  { key: 'latency', label: 'LATENCY', title: '风控耗时', sub: '风控与接口延迟', color: '#cabdff' },
];

export default function OverviewPage() {
  const { state } = useDemo();
  const txs = state.transactions;

  const decided = txs.filter((t) => t.status !== 'queued' && t.status !== 'validating');
  const pct = (n: number) => (decided.length === 0 ? '—' : `${Math.round((n / decided.length) * 100)}%`);
  const scored = txs.filter((t) => t.risk !== null);
  const avgScore =
    scored.length === 0
      ? 0
      : Math.round(scored.reduce((s, t) => s + (t.risk?.score ?? 0), 0) / scored.length);
  const openChallenges = state.challenges.filter((c) => c.state === 'open');
  const desksOpen = Object.values(state.desks).filter((d) => d.verifiedAt !== null).length;

  return (
    <>
      <DemoPageHeader
        title="概览"
        subtitle="撮合、风控与席位的整体状况"
        actions={
          <>
            <HeaderButton>导出 CSV</HeaderButton>
            <HeaderButton>PDF 报告</HeaderButton>
            <HeaderButton>文档</HeaderButton>
          </>
        }
      />

      {/* 时间范围条。全是装饰，但它是「这是个运行中的系统」观感的主要来源。 */}
      <div className="border-hairline bg-surface mb-[26px] flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-panel)] border px-[18px] py-3 text-[13px]">
        <span className="flex gap-1">
          {RANGES.map((r, i) => (
            <span
              key={r}
              className={`rounded-[7px] px-2.5 py-1 ${
                i === 0 ? 'bg-surface-raised text-txt' : 'text-muted'
              }`}
            >
              {r}
            </span>
          ))}
        </span>
        <span className="text-txt">最近 24 小时</span>
        <span className="text-muted">生成于 {fmtTime(new Date().toISOString())}</span>
        <span className="text-muted ml-auto flex items-center gap-2">
          <span className="bg-ok h-1.5 w-1.5 animate-pulse rounded-full" />
          实时 · 每 30 秒刷新
        </span>
      </div>

      <div className="mb-[18px] grid grid-cols-4 gap-[18px]">
        <KpiTile label="撮合总量" value={txs.length} accent="brand" sub="全部交易" />
        <KpiTile
          label="通过率"
          value={pct(txs.filter((t) => t.status === 'passed').length)}
          sub={`${decided.length} 笔已裁决`}
        />
        <KpiTile label="挡单率" value={pct(txs.filter((t) => t.status === 'challenged').length)} sub="需补充材料" />
        <KpiTile label="拒绝率" value={pct(txs.filter((t) => t.status === 'declined').length)} sub="风控否决" />
      </div>

      <div className="mb-[26px] grid grid-cols-[repeat(4,minmax(0,1fr))_360px] gap-[18px]">
        <KpiTile label="平均评分" value={avgScore} sub={`${scored.length} 笔已评分`} />
        <KpiTile label="平均风控耗时" value="4.8s" sub="六项检查串行" />
        <KpiTile label="池中挂单" value={state.pool.length} sub="可撮合" />
        <KpiTile
          label="席位状态"
          value={`${desksOpen} / 2`}
          accent={desksOpen === 2 ? 'ok' : 'warn'}
          sub={desksOpen === 2 ? '买方与卖方均已开通' : '有席位尚未开通'}
        />

        {/* 任务积压面板，照抄 Trustline 的 All clear 空态 */}
        <div className="bg-surface border-hairline row-span-1 rounded-[var(--radius-panel)] border p-[22px]">
          <div className="mb-4 text-[15px] font-semibold">任务积压</div>
          {openChallenges.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <span className="border-ok text-ok mb-3 flex h-8 w-8 items-center justify-center rounded-full border text-[15px]">
                ✓
              </span>
              <div className="text-[14px]">一切正常 —— 暂无紧急任务</div>
              <p className="text-muted mt-1.5 text-[12px]">新挡单、连续拒绝和指标异常会出现在这里。</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {openChallenges.slice(0, 3).map((c) => (
                <li key={c.id} className="border-hairline border-b pb-2.5 last:border-b-0 last:pb-0">
                  <div className="text-warn text-[13px]">{c.reason}</div>
                  <div className="text-muted mt-0.5 font-mono text-[11px]">{c.txId}</div>
                </li>
              ))}
              {openChallenges.length > 3 && (
                <li className="text-muted text-[12px]">另有 {openChallenges.length - 3} 条</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="text-muted mb-1 text-[11px] font-semibold tracking-[0.08em]">TRENDS</div>
      <h2 className="mb-[18px] text-[21px] font-semibold tracking-tight">风控活动图表</h2>

      <div className="grid grid-cols-2 gap-[18px]">
        {CHARTS.map((c) => (
          <div
            key={c.key}
            className="bg-surface border-hairline rounded-[var(--radius-panel)] border p-[22px]"
          >
            <div className="text-muted text-[11px] font-semibold tracking-[0.08em]">{c.label}</div>
            <div className="mt-1 text-[17px] font-semibold">{c.title}</div>
            <p className="text-muted mt-1 mb-4 text-[13px]">{c.sub}</p>
            {txs.length === 0 ? (
              <div className="border-hairline text-muted flex h-[120px] items-center justify-center rounded-[var(--radius-sm)] border text-[13px]">
                此时间窗内暂无活动
              </div>
            ) : (
              <Sparkline points={series(c.key)} color={c.color} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
