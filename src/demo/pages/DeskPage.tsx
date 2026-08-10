import { useState } from 'react';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';
import type { Desk } from '@/demo/types';

const LIFECYCLE = [
  { t: '开通账户', d: '完成实名认证，拿到账户编号。买入和卖出是两个独立账户。' },
  { t: '大厅接单', d: '在交易大厅挑一笔别人挂出的单，点确认就自动成交。' },
  { t: 'AI 安全检查', d: 'AI 逐项核对对方身份、历史和收款地址，给出一个安全分。' },
  { t: '完成交易', d: '双方确认后归档，这笔交易会计入你的成交记录。' },
];

export default function DeskPage() {
  const { state } = useDemo();

  return (
    <>
      <DemoPageHeader
        title="我的账户"
        subtitle="买入账户与卖出账户，各自独立开通"
        actions={<HeaderButton>文档</HeaderButton>}
      />

      <div className="mb-8 grid grid-cols-2 gap-[18px]">
        <DeskCard desk={state.desks.buy} />
        <DeskCard desk={state.desks.sell} />
      </div>

      <section className="bg-surface border-hairline rounded-[var(--radius-panel)] border p-[22px]">
        <div className="text-muted mb-1 text-[11px] font-semibold tracking-[0.08em]">
          它是怎么运转的
        </div>
        <h2 className="mb-7 text-[21px] font-semibold tracking-tight">从开通账户到完成交易</h2>

        <ol className="grid grid-cols-4 gap-6">
          {LIFECYCLE.map((s, i) => (
            <li key={s.t} className="relative">
              <div className="mb-3.5 flex items-center gap-3">
                <span className="bg-brand/12 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums">
                  {i + 1}
                </span>
                {i < LIFECYCLE.length - 1 && <span className="bg-hairline h-px flex-1" />}
              </div>
              <div className="mb-1.5 text-[15px] font-medium">{s.t}</div>
              <p className="text-muted text-[13px] leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function DeskCard({ desk }: { desk: Desk }) {
  const { dispatch } = useDemo();
  const label = desk.kind === 'buy' ? '买入账户' : '卖出账户';
  const [name, setName] = useState(`我的${label}`);

  if (desk.verifiedAt === null) {
    return (
      <div className="border-hairline-strong flex min-h-[236px] flex-col justify-center rounded-[var(--radius-panel)] border border-dashed p-[22px]">
        <div className="text-muted mb-1 text-[11px] font-semibold tracking-[0.08em]">
          {label.toUpperCase()}
        </div>
        <h3 className="mb-1.5 text-[17px] font-medium">还没开通{label}</h3>
        <p className="text-muted mb-5 text-[13px]">
          开通后就能在交易大厅用它{desk.kind === 'buy' ? '买入' : '卖出'}。
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="给它起个名字"
          className="border-hairline-strong bg-bg text-txt placeholder:text-muted focus:border-brand mb-3 h-10 w-full rounded-[var(--radius-sm)] border px-3.5 text-[14px] outline-none transition-colors"
        />
        <button
          onClick={() => dispatch({ type: 'openDesk', kind: desk.kind, name: name.trim() || label })}
          disabled={!name.trim()}
          className="bg-brand hover:bg-brand-dim h-10 w-full rounded-[var(--radius-sm)] text-[14px] font-semibold text-[#0b0d12] transition-colors disabled:opacity-40"
        >
          立即开通
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface border-hairline min-h-[236px] rounded-[var(--radius-panel)] border p-[22px] transition-all duration-300">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-muted mb-1 text-[11px] font-semibold tracking-[0.08em]">
            {label.toUpperCase()}
          </div>
          <h3 className="text-[19px] font-semibold tracking-tight">{desk.name}</h3>
          <div className="text-muted mt-1 font-mono text-[12px]">{desk.displayId}</div>
        </div>
        <span
          className="text-ok bg-ok/12 rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] font-medium"
          style={{ boxShadow: '0 0 12px #8ee0ba33' }}
        >
          已验证
        </span>
      </div>

      <div className="border-hairline grid grid-cols-3 gap-4 border-t pt-4">
        <Stat label="成交笔数" value={`${desk.completedTrades}`} />
        <Stat label="纠纷" value={`${desk.disputes}`} />
        <Stat label="平均回复" value={`${desk.avgResponseMin} 分钟`} />
      </div>

      <div className="text-muted mt-4 text-[12px]">
        开通于 {new Date(desk.verifiedAt).toISOString().slice(0, 10)}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted text-[11px]">{label}</div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
