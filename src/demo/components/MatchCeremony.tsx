import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import CountUp from '@/demo/components/CountUp';
import ScoreRing from '@/demo/components/ScoreRing';
import { challengeFromRisk } from '@/demo/engine/challenge';
import { assessRisk } from '@/demo/engine/riskEngine';
import { fmtAmount, fmtFiat } from '@/demo/format';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';
import { useTypewriter } from '@/demo/hooks/useTypewriter';
import { useDemo } from '@/demo/state/useDemo';
import type { CheckStatus, Desk, PoolOrder, RiskCheck, RiskResult, Transaction } from '@/demo/types';

const CHECK_COUNT = 8;

/** 每一幕的起始时刻（毫秒）。改节奏只动这里。 */
const T = {
  extract: 850,
  checks: 1650,
  perCheck: 340,
  get score() {
    return this.checks + CHECK_COUNT * this.perCheck + 250;
  },
  get summary() {
    return this.score + 900;
  },
};

const ICON: Record<CheckStatus, { glyph: string; cls: string; ring: string }> = {
  pass: { glyph: '✓', cls: 'text-ok', ring: 'var(--color-ok)' },
  warn: { glyph: '!', cls: 'text-warn', ring: 'var(--color-warn)' },
  fail: { glyph: '✕', cls: 'text-bad', ring: 'var(--color-bad)' },
};

const VERDICT = {
  pass: { label: '可以放心交易', cls: 'text-ok', glow: 'var(--color-ok)' },
  challenge: { label: '需要补充材料', cls: 'text-warn', glow: 'var(--color-warn)' },
  decline: { label: '建议放弃这一单', cls: 'text-bad', glow: 'var(--color-bad)' },
} as const;

/**
 * 接单后的全屏 AI 审核演出。
 *
 * 结论在第一帧就由 assessRisk 算完了（本地纯函数，无网络请求）；这里只是把它
 * 按节奏演出来。
 *
 * **演出结束不自动关闭**，停在结论页等用户决定继续还是放弃。因此状态 dispatch
 * 全部推迟到用户点「继续交易」那一刻——放弃的话这笔挂单原样留在大厅里，不会
 * 凭空少一条。
 */
export default function MatchCeremony({
  order,
  desk,
  onClose,
}: {
  order: PoolOrder;
  desk: Desk;
  onClose: () => void;
}) {
  const { dispatch } = useDemo();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const tx: Transaction = useMemo(
    () => ({
      id: `tx_${Date.now().toString(36)}`,
      poolOrderId: order.id,
      side: desk.kind,
      asset: order.asset,
      amount: order.amount,
      fiatTotal: order.fiatTotal,
      fiatCurrency: order.fiatCurrency,
      counterparty: order.counterparty,
      status: 'queued',
      createdAt: new Date().toISOString(),
      risk: null,
      resubmits: 0,
    }),
    [order, desk.kind],
  );

  const risk = useMemo(() => assessRisk(tx), [tx]);

  useEffect(() => {
    if (reduced) {
      setSkipped(true);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const ms = now - start;
      setElapsed(ms);
      if (ms < T.summary + 200) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // rAF 在后台标签页会停。没有兜底的话切回来时演出会永远停在第一帧。
    const failsafe = setTimeout(() => setSkipped(true), T.summary + 2500);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failsafe);
    };
  }, [reduced]);

  const t = skipped ? T.summary + 1 : elapsed;
  const merged = t >= T.extract;
  const extracting = t >= T.extract && t < T.checks;
  const revealed = Math.max(0, Math.min(CHECK_COUNT, Math.floor((t - T.checks) / T.perCheck) + 1));
  const showScore = t >= T.score;
  const showSummary = t >= T.summary;

  const typed = useTypewriter(risk.summary, showSummary && !skipped);
  const summaryText = skipped ? risk.summary : typed.shown;
  const summaryDone = skipped || typed.done;

  // 内容随推理逐段变长，不自动跟随的话用户会一直看着屏幕外的东西发生。
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [revealed, showScore, showSummary, reduced]);

  const v = VERDICT[risk.verdict];

  /** 用户确认继续：这时才真正生成交易。 */
  function proceed() {
    dispatch({ type: 'match', order, tx });
    dispatch({ type: 'setTxStatus', txId: tx.id, status: 'validating' });
    dispatch({ type: 'setTxRisk', txId: tx.id, risk });
    const status =
      risk.verdict === 'pass' ? 'passed' : risk.verdict === 'challenge' ? 'challenged' : 'declined';
    dispatch({ type: 'setTxStatus', txId: tx.id, status });
    if (risk.verdict === 'challenge') {
      dispatch({
        type: 'openChallenge',
        challenge: challengeFromRisk(`ch_${tx.id}_0`, tx.id, risk, new Date().toISOString()),
      });
    }
    onClose();
    navigate('/queue');
  }

  return (
    <div
      ref={scroller}
      className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto px-6 pt-10 backdrop-blur-sm"
      style={{ background: 'var(--c-overlay)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(760px 460px at 50% 40%, color-mix(in oklab, ${
            showScore ? v.glow : 'var(--color-brand)'
          } 12%, transparent), transparent 70%)`,
          transition: 'background 700ms ease',
        }}
      />

      {!summaryDone && (
        <button
          onClick={() => setSkipped(true)}
          className="text-muted hover:text-txt fixed top-6 right-7 z-10 text-[13px] transition-colors"
        >
          跳到结果 →
        </button>
      )}

      <div className="relative w-full max-w-[680px]">
        <div className="mb-7 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />
            <span className="text-brand text-[12px] font-semibold tracking-[0.14em]">
              ATARA 风险模型
            </span>
          </div>
          <div className="text-muted h-4 text-[12px]">
            {t < T.extract
              ? '正在建立双方交易上下文…'
              : extracting
                ? `正在提取特征向量 · ${risk.featureCount} 维`
                : `已提取 ${risk.featureCount} 维特征，多模型并行推理中`}
          </div>
        </div>

        {!merged ? (
          <div className="relative flex h-[132px] items-center justify-center">
            <Party
              className="animate-[flyLeft_.85s_cubic-bezier(.35,0,.15,1)_forwards]"
              title={desk.name}
              sub={desk.displayId}
            />
            <Party
              className="animate-[flyRight_.85s_cubic-bezier(.35,0,.15,1)_forwards]"
              title={order.counterparty.name}
              sub={order.counterparty.displayId}
            />
          </div>
        ) : (
          <div className="border-brand/40 bg-surface relative animate-[popIn_.4s_ease-out] overflow-hidden rounded-[var(--radius-md)] border p-5">
            {extracting && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-16"
                style={{
                  background:
                    'linear-gradient(180deg, transparent, color-mix(in oklab, var(--color-brand) 20%, transparent), transparent)',
                  animation: 'scanBeam 800ms ease-in-out',
                }}
              />
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-[19px] font-semibold tabular-nums">
                {fmtAmount(order.amount)} {order.asset}
              </span>
              <span className="text-muted text-[13px] tabular-nums">
                {fmtFiat(order.fiatTotal, order.fiatCurrency)}
              </span>
            </div>
            <div className="text-muted mt-1.5 text-[12px]">
              {desk.name} <span className="text-brand mx-1.5">⇄</span> {order.counterparty.name}
            </div>
          </div>
        )}

        {t >= T.checks && (
          <div className="mt-6 space-y-5">
            {groupChecks(risk, revealed).map((g) => (
              <section key={g.group}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="text-muted text-[11px] font-semibold tracking-[0.08em]">
                    {g.group}
                  </span>
                  <span className="bg-hairline h-px flex-1" />
                  {g.running ? (
                    <span className="text-info text-[11px]">推理中…</span>
                  ) : (
                    <span className="text-muted text-[11px] tabular-nums">{g.totalMs} ms</span>
                  )}
                </div>
                <ul className="space-y-2">
                  {g.items.map(({ check, shown }) =>
                    shown ? (
                      <RevealedRow key={check.id} check={check} />
                    ) : (
                      <PendingRow key={check.id} label={check.label} model={check.model} />
                    ),
                  )}
                </ul>
              </section>
            ))}
          </div>
        )}

        {showScore && (
          <div className="border-hairline mt-8 flex animate-[fadeUp_.45s_ease-out] items-center gap-8 border-t pt-8">
            <ScoreRing score={risk.score} threshold={risk.threshold} size={132} />
            <div className="min-w-0">
              <div className="text-muted text-[12px]">集成模型输出</div>
              <div className="mt-1 text-[14px] tabular-nums">
                及格线 {risk.threshold} / 100
                <span className="text-muted mx-2">·</span>
                置信度 <CountUp value={risk.confidence} />%
              </div>
              <div className={`mt-3 text-[24px] font-semibold ${v.cls}`}>{v.label}</div>
            </div>
          </div>
        )}

        {showSummary && (
          <div className="bg-surface border-hairline mt-6 animate-[fadeUp_.4s_ease-out] rounded-[var(--radius-sm)] border p-5">
            <div className="text-muted mb-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em]">
              模型结论
              {!summaryDone && <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />}
            </div>
            <p className="text-[14px] leading-relaxed">
              {summaryText}
              {!summaryDone && (
                <span className="bg-brand ml-0.5 inline-block h-4 w-[2px] align-middle" />
              )}
            </p>
          </div>
        )}

        {/* 演出不自动关闭：停在这里由用户决定 */}
        {/* 钉在视口底部：八项检查铺开后内容很长，按钮掉到折叠线以下用户会找不到 */}
        {summaryDone && (
          <div
            className="animate-[fadeUp_.4s_ease-out] sticky bottom-0 mt-6 pt-4 pb-6"
            style={{
              background:
                'linear-gradient(180deg, transparent, var(--c-overlay) 28%, var(--c-overlay))',
            }}
          >
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="border-hairline-strong text-txt hover:border-bad hover:text-bad h-12 flex-1 rounded-[var(--radius-sm)] border text-[15px] font-semibold transition-colors"
              >
                放弃这一单
              </button>
              <button
                onClick={proceed}
                className={`h-12 flex-[1.4] rounded-[var(--radius-sm)] text-[15px] font-semibold transition-colors ${
                  risk.verdict === 'decline'
                    ? 'border-bad text-bad hover:bg-bad hover:text-on-brand border'
                    : 'bg-brand hover:bg-brand-dim text-on-brand'
                }`}
              >
                {risk.verdict === 'decline' ? '我已知悉风险，仍要继续' : '继续交易'}
              </button>
            </div>
            <p className="text-muted mt-3 text-center text-[12px]">
              放弃后这笔挂单会留在交易大厅，随时可以再来
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 按组切分，并算出每组是否还在「推理中」。 */
function groupChecks(risk: RiskResult, revealed: number) {
  const out: {
    group: string;
    running: boolean;
    totalMs: number;
    items: { check: RiskCheck; shown: boolean }[];
  }[] = [];

  risk.checks.forEach((check, i) => {
    let g = out.find((x) => x.group === check.group);
    if (!g) {
      g = { group: check.group, running: false, totalMs: 0, items: [] };
      out.push(g);
    }
    const shown = i < revealed;
    g.items.push({ check, shown });
    if (shown) g.totalMs += check.latencyMs;
    else g.running = true;
  });

  return out;
}

function RevealedRow({ check }: { check: RiskCheck }) {
  const ic = ICON[check.status];
  return (
    <li
      className="bg-surface border-hairline flex animate-[popIn_.3s_cubic-bezier(.2,.9,.3,1)] items-center gap-3 rounded-[var(--radius-sm)] border px-4 py-2.5"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ic.ring} 14%, transparent)` }}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${ic.cls}`}
        style={{
          background: 'currentColor',
          boxShadow: `0 0 10px color-mix(in oklab, ${ic.ring} 40%, transparent)`,
        }}
      >
        <span className="text-on-brand">{ic.glyph}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">{check.label}</span>
        <span className="text-muted block font-mono text-[10px]">
          {check.model} · {check.latencyMs}ms
        </span>
      </span>
      <span className={`shrink-0 text-right text-[12px] ${ic.cls}`}>{check.detail}</span>
    </li>
  );
}

function PendingRow({ label, model }: { label: string; model: string }) {
  return (
    <li className="border-hairline flex items-center gap-3 rounded-[var(--radius-sm)] border border-dashed px-4 py-2.5 opacity-30">
      <span className="border-hairline-strong h-5 w-5 shrink-0 animate-pulse rounded-full border" />
      <span className="min-w-0 flex-1">
        <span className="text-muted block text-[13px]">{label}</span>
        <span className="text-muted block font-mono text-[10px]">{model}</span>
      </span>
    </li>
  );
}

function Party({ title, sub, className }: { title: string; sub: string; className: string }) {
  return (
    <div
      className={`bg-surface border-hairline-strong absolute w-[210px] rounded-[var(--radius-sm)] border p-4 text-center ${className}`}
    >
      <div className="truncate text-[14px] font-medium">{title}</div>
      <div className="text-muted mt-1 font-mono text-[11px]">{sub}</div>
    </div>
  );
}
