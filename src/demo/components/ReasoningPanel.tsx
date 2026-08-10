import ScoreRing from '@/demo/components/ScoreRing';
import { assessRisk } from '@/demo/engine/riskEngine';
import { fmtAmount, fmtFiat } from '@/demo/format';
import { useStreamingChecks } from '@/demo/hooks/useStreamingChecks';
import type { CheckStatus, RiskCheck, Transaction } from '@/demo/types';

const ICON: Record<CheckStatus, { glyph: string; cls: string }> = {
  pass: { glyph: '✓', cls: 'text-ok' },
  warn: { glyph: '!', cls: 'text-warn' },
  fail: { glyph: '✕', cls: 'text-bad' },
};

const VERDICT_TEXT = {
  pass: { label: '可以放心交易', cls: 'text-ok' },
  challenge: { label: '需要你补充材料', cls: 'text-warn' },
  decline: { label: '建议不要交易', cls: 'text-bad' },
} as const;

export default function ReasoningPanel({ tx }: { tx: Transaction }) {
  // tx.risk 为空时现算一份用于显示。真正落库由 QueuePage 的 effect 负责。
  const risk = tx.risk ?? assessRisk(tx);
  const streaming = tx.status === 'validating';
  const { revealed, done } = useStreamingChecks(risk.checks, streaming);

  // 非 validating 状态直接显示全部；validating 时按节奏揭示。
  const shown = streaming ? revealed : risk.checks;
  const finished = streaming ? done : true;

  return (
    <div className="space-y-6">
      <section>
        <div className="bg-bg border-hairline rounded-[var(--radius-sm)] border p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[13px]">{tx.id}</span>
            <span className="text-muted text-[12px]">
              {tx.side === 'buy' ? '买入' : '卖出'} · {tx.counterparty.name}
            </span>
          </div>
          <div className="mt-2 text-[14px]">
            {fmtAmount(tx.amount)} {tx.asset}
            <span className="text-muted mx-2">·</span>
            {fmtFiat(tx.fiatTotal, tx.fiatCurrency)}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3.5 flex items-center gap-2.5">
          <span className="text-muted text-[11px] font-semibold tracking-[0.08em]">AI 安全检查</span>
          {!finished && (
            <span className="text-info flex items-center gap-1.5 text-[12px]">
              <span className="bg-info h-1.5 w-1.5 animate-pulse rounded-full" />
              正在检查
            </span>
          )}
          {tx.resubmits > 0 && (
            <span className="text-muted ml-auto text-[12px]">
              第 {tx.resubmits + 1} 次检查 · 材料已补充
            </span>
          )}
        </div>

        <ol className="space-y-0">
          {risk.checks.map((c, i) => {
            const isShown = i < shown.length;
            return isShown ? (
              <RevealedRow key={c.id} check={c} />
            ) : (
              <PendingRow key={c.id} label={c.label} />
            );
          })}
        </ol>
      </section>

      {finished && (
        <section className="border-hairline animate-[fadeUp_.4s_ease-out] border-t pt-6">
          <div className="flex items-center gap-6">
            <ScoreRing score={risk.score} threshold={risk.threshold} size={116} />
            <div className="min-w-0">
              <div className="text-muted text-[12px]">安全评分</div>
              <div className="mt-1.5 text-[15px] leading-relaxed">
                <span className="tabular-nums">{risk.score}</span>
                <span className="text-muted"> / 100 · 及格线 </span>
                <span className="tabular-nums">{risk.threshold}</span>
              </div>
              <div className={`mt-2.5 text-[19px] font-semibold ${VERDICT_TEXT[risk.verdict].cls}`}>
                {VERDICT_TEXT[risk.verdict].label}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RevealedRow({ check }: { check: RiskCheck }) {
  const icon = ICON[check.status];
  return (
    <li className="border-hairline flex animate-[fadeUp_.35s_ease-out] items-center gap-3 border-b py-3 last:border-b-0">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${icon.cls}`}
        style={{ background: 'currentColor' }}
      >
        <span className="text-[#0b0d12]">{icon.glyph}</span>
      </span>
      <span className="flex-1 text-[13px]">{check.label}</span>
      <span className={`text-right text-[12px] ${icon.cls}`}>{check.detail}</span>
    </li>
  );
}

function PendingRow({ label }: { label: string }) {
  return (
    <li className="border-hairline flex items-center gap-3 border-b py-3 opacity-35 last:border-b-0">
      <span className="border-hairline-strong h-5 w-5 shrink-0 rounded-full border" />
      <span className="text-muted flex-1 text-[13px]">{label}</span>
      <span className="text-muted flex gap-1 text-[12px]">
        <Dot delay="0ms" />
        <Dot delay="160ms" />
        <Dot delay="320ms" />
      </span>
    </li>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="bg-muted h-1 w-1 animate-bounce rounded-full"
      style={{ animationDelay: delay }}
    />
  );
}
