import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import CountUp from '@/demo/components/CountUp';
import ScoreRing from '@/demo/components/ScoreRing';
import { challengeFromRisk } from '@/demo/engine/challenge';
import { matchOrder } from '@/demo/engine/matching';
import { assessRisk } from '@/demo/engine/riskEngine';
import { fmtAmount, fmtFiat } from '@/demo/format';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';
import { useTypewriter } from '@/demo/hooks/useTypewriter';
import { useDemo } from '@/demo/state/useDemo';
import type { CheckStatus, Desk, PoolOrder, RiskCheck, RiskResult, Transaction } from '@/demo/types';

const CHECK_COUNT = 8;

/** 每一幕的起始时刻（毫秒）。改节奏只动这里。 */
const T = {
  extract: 700,
  checks: 1400,
  perCheck: 300,
  get score() {
    return this.checks + CHECK_COUNT * this.perCheck + 220;
  },
  get summary() {
    return this.score + 800;
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
 * 点「成交」后弹出的 AI 审核弹窗。交易大厅和快捷兑换共用它。
 *
 * 结论在第一帧就由 assessRisk 算完了（本地纯函数，无网络请求）；这里只是把它
 * 按节奏演出来。
 *
 * **弹窗不自动关闭**，停在结论处等用户决定继续还是放弃。因此状态 dispatch 全部
 * 推迟到用户点「继续交易」那一刻——放弃的话这笔挂单原样留在大厅里，不会凭空
 * 少一条。
 */
export default function AiReviewModal({
  order,
  desk,
  source,
  onClose,
}: {
  order: PoolOrder;
  desk: Desk;
  /** 这笔单是怎么来的，显示在弹窗副标题上 */
  source: '你从大厅挑选' | 'AI 自动撮合';
  onClose: () => void;
}) {
  const { dispatch } = useDemo();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  const gate = matchOrder(desk);

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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    // 账户没开通就不跑演出，直接给出口
    if (!gate.ok) return;
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
  }, [reduced, gate.ok]);

  const t = skipped ? T.summary + 1 : elapsed;
  const extracting = t >= T.extract && t < T.checks;
  const revealed = Math.max(0, Math.min(CHECK_COUNT, Math.floor((t - T.checks) / T.perCheck) + 1));
  const showScore = t >= T.score;
  const showSummary = t >= T.summary;

  const typed = useTypewriter(risk.summary, showSummary && !skipped);
  const summaryText = skipped ? risk.summary : typed.shown;
  const summaryDone = skipped || typed.done;

  // 内容随推理逐段变长，不自动跟随的话用户会一直看着弹窗外发生的事。
  useEffect(() => {
    const el = body.current;
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
    navigate('/trades');
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div
        onClick={onClose}
        className="absolute inset-0 animate-[fadeUp_.25s_ease-out] backdrop-blur-sm"
        style={{ background: 'var(--c-overlay)' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border-hairline relative flex max-h-[86vh] w-full max-w-[720px] animate-[modalIn_.34s_cubic-bezier(.2,.9,.3,1)] flex-col overflow-hidden rounded-[var(--radius-md)] border shadow-[var(--shadow-panel)]"
      >
        {/* 顶部：品牌 + 状态 + 关闭 */}
        <div className="border-hairline relative flex shrink-0 items-center gap-3 border-b px-6 py-4">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(420px 90px at 22% 0%, color-mix(in oklab, ${
                showScore ? v.glow : 'var(--color-brand)'
              } 16%, transparent), transparent 70%)`,
              transition: 'background 700ms ease',
            }}
          />
          <span className="bg-brand relative h-1.5 w-1.5 animate-pulse rounded-full" />
          <div className="relative min-w-0 flex-1">
            <div className="text-brand text-[12px] font-semibold tracking-[0.14em]">
              ATARA 风险模型
            </div>
            <div className="text-muted mt-0.5 truncate text-[12px]">
              {!gate.ok
                ? gate.reason
                : t < T.extract
                  ? `${source} · 正在建立交易上下文…`
                  : extracting
                    ? `正在提取特征向量 · ${risk.featureCount} 维`
                    : summaryDone
                      ? `${source} · 已完成 ${CHECK_COUNT} 项判定`
                      : `已提取 ${risk.featureCount} 维特征，多模型并行推理中`}
            </div>
          </div>
          {!summaryDone && gate.ok && (
            <button
              onClick={() => setSkipped(true)}
              className="text-muted hover:text-txt relative text-[12px] transition-colors"
            >
              跳到结果
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-muted hover:text-txt relative text-[20px] leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div ref={body} className="flex-1 overflow-y-auto px-6 py-5">
          {/* 交易与对手方摘要 */}
          <div className="bg-bg border-hairline rounded-[var(--radius-sm)] border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[22px] font-semibold tabular-nums">
                {fmtAmount(order.amount)} {order.asset}
              </span>
              <span className="text-muted shrink-0 text-[13px] tabular-nums">
                {fmtFiat(order.fiatTotal, order.fiatCurrency)}
              </span>
            </div>
            <div className="border-hairline mt-3 flex items-center gap-3 border-t pt-3">
              <span className="bg-surface-raised text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold">
                {order.counterparty.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{order.counterparty.name}</span>
                <span className="text-muted block text-[11px]">
                  成交 {order.counterparty.completedTrades} 笔 · 纠纷{' '}
                  {order.counterparty.disputes} 次 · 信用 {order.counterparty.score}
                </span>
              </span>
              <span className="text-muted shrink-0 text-[11px]">
                {desk.kind === 'buy' ? 'BUY' : 'SELL'} · {order.chain}
              </span>
            </div>
          </div>

          {!gate.ok ? (
            <p className="text-muted mt-5 text-[13px]">
              开通账户后就能让 AI 对这笔交易做完整的安全检查。
            </p>
          ) : (
            <>
              {t >= T.extract && t < T.checks && (
                <div className="border-brand/40 bg-bg relative mt-4 overflow-hidden rounded-[var(--radius-sm)] border p-4">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 h-14"
                    style={{
                      background:
                        'linear-gradient(180deg, transparent, color-mix(in oklab, var(--color-brand) 22%, transparent), transparent)',
                      animation: 'scanBeam 700ms ease-in-out infinite',
                    }}
                  />
                  <div className="text-brand relative text-[13px]">
                    正在汇总链上记录、履约历史与名单库…
                  </div>
                </div>
              )}

              {t >= T.checks && (
                <div className="mt-5 space-y-4">
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
                <div className="border-hairline mt-6 flex animate-[fadeUp_.45s_ease-out] items-center gap-7 border-t pt-6">
                  <ScoreRing score={risk.score} threshold={risk.threshold} size={124} />
                  <div className="min-w-0">
                    <div className="text-muted text-[12px]">集成模型输出</div>
                    <div className="mt-1 text-[14px] tabular-nums">
                      及格线 {risk.threshold} / 100
                      <span className="text-muted mx-2">·</span>
                      置信度 <CountUp value={risk.confidence} />%
                    </div>
                    <div className={`mt-2.5 text-[22px] font-semibold ${v.cls}`}>{v.label}</div>
                  </div>
                </div>
              )}

              {showSummary && (
                <div className="bg-bg border-hairline mt-5 animate-[fadeUp_.4s_ease-out] rounded-[var(--radius-sm)] border p-4">
                  <div className="text-muted mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em]">
                    模型结论
                    {!summaryDone && (
                      <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />
                    )}
                  </div>
                  <p className="text-[13.5px] leading-relaxed">
                    {summaryText}
                    {!summaryDone && (
                      <span className="bg-brand ml-0.5 inline-block h-4 w-[2px] align-middle" />
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作栏。弹窗不自动关闭，由用户决定。 */}
        <div className="border-hairline bg-surface shrink-0 border-t px-6 py-4">
          {!gate.ok ? (
            <button
              onClick={() => {
                onClose();
                navigate('/desk');
              }}
              className="bg-brand hover:bg-brand-dim text-on-brand h-12 w-full rounded-[var(--radius-sm)] text-[15px] font-semibold transition-colors"
            >
              去开通账户
            </button>
          ) : summaryDone ? (
            <div className="animate-[fadeUp_.3s_ease-out]">
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
              <p className="text-muted mt-2.5 text-center text-[12px]">
                放弃后这笔挂单会留在大厅，随时可以再来
              </p>
            </div>
          ) : (
            <div className="text-muted flex h-12 items-center justify-center gap-2 text-[13px]">
              <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />
              模型推理中，请稍候…
            </div>
          )}
        </div>
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
      className="bg-bg border-hairline flex animate-[popIn_.3s_cubic-bezier(.2,.9,.3,1)] items-center gap-3 rounded-[var(--radius-sm)] border px-3.5 py-2.5"
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
    <li className="border-hairline flex items-center gap-3 rounded-[var(--radius-sm)] border border-dashed px-3.5 py-2.5 opacity-30">
      <span className="border-hairline-strong h-5 w-5 shrink-0 animate-pulse rounded-full border" />
      <span className="min-w-0 flex-1">
        <span className="text-muted block text-[13px]">{label}</span>
        <span className="text-muted block font-mono text-[10px]">{model}</span>
      </span>
    </li>
  );
}
