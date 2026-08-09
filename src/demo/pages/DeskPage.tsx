import { useState } from 'react';
import DemoPageHeader, { HeaderButton } from '@/demo/layout/DemoPageHeader';
import { useDemo } from '@/demo/state/useDemo';
import type { Desk } from '@/demo/types';

const LIFECYCLE = [
  { t: '开通席位', d: '完成实名，获得席位编号。买方席位与卖方席位相互独立。' },
  { t: '池中撮合', d: '从订单池挑一笔对手方挂单，系统自动成交并生成交易。' },
  { t: '风控校验', d: '六项检查综合评分，低于阈值的交易会被挡下要求补充材料。' },
  { t: '结算完成', d: '双方确认后交易归档，计入席位的成交与争议记录。' },
];

export default function DeskPage() {
  const { state } = useDemo();

  return (
    <>
      <DemoPageHeader
        title="我的席位"
        subtitle="买方席位与卖方席位，各自独立开通"
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
        <h2 className="mb-7 text-[21px] font-semibold tracking-tight">从开通席位到结算完成</h2>

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
  const label = desk.kind === 'buy' ? '买方席位' : '卖方席位';
  const [name, setName] = useState(`我的${label}`);

  if (desk.verifiedAt === null) {
    return (
      <div className="border-hairline-strong flex min-h-[236px] flex-col justify-center rounded-[var(--radius-panel)] border border-dashed p-[22px]">
        <div className="text-muted mb-1 text-[11px] font-semibold tracking-[0.08em]">
          {label.toUpperCase()}
        </div>
        <h3 className="mb-1.5 text-[17px] font-medium">尚未开通{label}</h3>
        <p className="text-muted mb-5 text-[13px]">
          开通后即可在订单池中以该席位撮合{desk.kind === 'buy' ? '卖单' : '买单'}。
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="席位名称"
          className="border-hairline-strong bg-bg text-txt placeholder:text-muted focus:border-brand mb-3 h-10 w-full rounded-[var(--radius-sm)] border px-3.5 text-[14px] outline-none transition-colors"
        />
        <button
          onClick={() => dispatch({ type: 'openDesk', kind: desk.kind, name: name.trim() || label })}
          disabled={!name.trim()}
          className="bg-brand hover:bg-brand-dim h-10 w-full rounded-[var(--radius-sm)] text-[14px] font-semibold text-[#0b0d12] transition-colors disabled:opacity-40"
        >
          开通席位
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
        <Stat label="成交" value={`${desk.completedTrades}`} />
        <Stat label="争议" value={`${desk.disputes}`} />
        <Stat label="响应中位" value={`${desk.avgResponseMin} 分`} />
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
