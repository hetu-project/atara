import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import ScoreRing from '@/demo/components/ScoreRing';
import { challengeFromRisk } from '@/demo/engine/challenge';
import { assessRisk } from '@/demo/engine/riskEngine';
import { fmtAmount, fmtFiat } from '@/demo/format';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';
import { useDemo } from '@/demo/state/useDemo';
import type { CheckStatus, Desk, PoolOrder, Transaction } from '@/demo/types';

/** 每一幕的起始时刻（毫秒）。改节奏只动这里。 */
const T = {
  merge: 0,
  scan: 900,
  checks: 1600,
  perCheck: 520,
  get score() {
    return this.checks + 6 * this.perCheck + 200;
  },
  get verdict() {
    return this.score + 950;
  },
  get done() {
    return this.verdict + 1500;
  },
};

const ICON: Record<CheckStatus, { glyph: string; cls: string; ring: string }> = {
  pass: { glyph: '✓', cls: 'text-ok', ring: '#8ee0ba' },
  warn: { glyph: '!', cls: 'text-warn', ring: '#f1b991' },
  fail: { glyph: '✕', cls: 'text-bad', ring: '#ffb4aa' },
};

const VERDICT = {
  pass: { label: '可以放心交易', hint: '这笔交易已通过全部检查', cls: 'text-ok', glow: '#8ee0ba' },
  challenge: {
    label: '需要你补充材料',
    hint: '已放进「待我处理」，补齐后会自动重新检查',
    cls: 'text-warn',
    glow: '#f1b991',
  },
  decline: { label: '建议不要交易', hint: 'AI 发现了明确的风险信号', cls: 'text-bad', glow: '#ffb4aa' },
} as const;

/**
 * 接单后的全屏 AI 审核演出。
 *
 * 结论在第一帧就由 assessRisk 算完了（本地纯函数，无网络请求）；这里只是把它
 * 按节奏演出来。状态 dispatch 跟着画面走，所以演出结束跳到「我的交易」时，
 * 那笔交易的状态和屏幕上刚看到的完全一致。
 */
export default function MatchCeremony({
  order,
  desk,
  onDone,
}: {
  order: PoolOrder;
  desk: Desk;
  onDone: () => void;
}) {
  const { dispatch } = useDemo();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const fired = useRef(new Set<string>());

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

  // 每一步只触发一次。用 ref 记而不是靠 elapsed 精确相等——rAF 的步进不保证命中。
  function fire(key: string, fn: () => void) {
    if (fired.current.has(key)) return;
    fired.current.add(key);
    fn();
  }

  function commitAll() {
    fire('match', () => dispatch({ type: 'match', order, tx }));
    fire('validating', () => dispatch({ type: 'setTxStatus', txId: tx.id, status: 'validating' }));
    fire('risk', () => dispatch({ type: 'setTxRisk', txId: tx.id, risk }));
    fire('final', () => {
      const status =
        risk.verdict === 'pass' ? 'passed' : risk.verdict === 'challenge' ? 'challenged' : 'declined';
      dispatch({ type: 'setTxStatus', txId: tx.id, status });
      if (risk.verdict === 'challenge') {
        dispatch({
          type: 'openChallenge',
          challenge: challengeFromRisk(`ch_${tx.id}_0`, tx.id, risk, new Date().toISOString()),
        });
      }
    });
  }

  function finish() {
    commitAll();
    onDone();
    navigate('/queue');
  }

  useEffect(() => {
    if (reduced) {
      finish();
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const ms = now - start;
      setElapsed(ms);

      if (ms >= T.merge) fire('match', () => dispatch({ type: 'match', order, tx }));
      if (ms >= T.scan)
        fire('validating', () => dispatch({ type: 'setTxStatus', txId: tx.id, status: 'validating' }));
      if (ms >= T.checks) fire('risk', () => dispatch({ type: 'setTxRisk', txId: tx.id, risk }));
      if (ms >= T.verdict) commitAll();

      if (ms >= T.done) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    // rAF 在后台标签页会停。兜底定时器保证演出一定会结束，不会把用户卡在全屏遮罩里。
    const failsafe = setTimeout(finish, T.done + 400);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failsafe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revealed = Math.max(
    0,
    Math.min(risk.checks.length, Math.floor((elapsed - T.checks) / T.perCheck) + 1),
  );
  const showScore = elapsed >= T.score;
  const showVerdict = elapsed >= T.verdict;
  const merged = elapsed >= T.scan;
  const v = VERDICT[risk.verdict];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto bg-[#07080c]/97 px-6 py-10 backdrop-blur-sm">
      {/* 背景光晕 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: showVerdict
            ? `radial-gradient(700px 420px at 50% 42%, ${v.glow}1a, transparent 70%)`
            : 'radial-gradient(700px 420px at 50% 42%, #7cd8c414, transparent 70%)',
          transition: 'background 700ms ease',
        }}
      />

      <button
        onClick={finish}
        className="text-muted hover:text-txt fixed top-6 right-7 z-10 text-[13px] transition-colors"
      >
        跳过 →
      </button>

      <div className="relative w-full max-w-[620px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="bg-brand h-1.5 w-1.5 animate-pulse rounded-full" />
          <span className="text-brand text-[12px] font-semibold tracking-[0.14em]">
            AI 安全检查
          </span>
        </div>

        {/* 第一幕：双方汇聚 */}
        {!merged ? (
          <div className="relative flex h-[132px] items-center justify-center">
            <Party
              className="animate-[flyLeft_.9s_cubic-bezier(.35,0,.15,1)_forwards]"
              title={desk.name}
              sub={desk.displayId}
            />
            <Party
              className="animate-[flyRight_.9s_cubic-bezier(.35,0,.15,1)_forwards]"
              title={order.counterparty.name}
              sub={order.counterparty.displayId}
            />
          </div>
        ) : (
          /* 合并后的交易卡，带一道扫描光束 */
          <div className="border-brand/40 bg-surface relative animate-[popIn_.4s_ease-out] overflow-hidden rounded-[var(--radius-md)] border p-5">
            {elapsed < T.checks && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-16"
                style={{
                  background: 'linear-gradient(180deg, transparent, #7cd8c433, transparent)',
                  animation: 'scanBeam 700ms ease-in-out',
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

        {/* 第二幕：逐项检查 */}
        {elapsed >= T.checks && (
          <ol className="mt-7 space-y-2">
            {risk.checks.map((c, i) => {
              if (i >= revealed) {
                return (
                  <li
                    key={c.id}
                    className="border-hairline flex items-center gap-3 rounded-[var(--radius-sm)] border border-dashed px-4 py-3 opacity-30"
                  >
                    <span className="border-hairline-strong h-5 w-5 shrink-0 rounded-full border" />
                    <span className="text-muted text-[13px]">{c.label}</span>
                  </li>
                );
              }
              const ic = ICON[c.status];
              return (
                <li
                  key={c.id}
                  className="bg-surface border-hairline flex animate-[popIn_.32s_cubic-bezier(.2,.9,.3,1)] items-center gap-3 rounded-[var(--radius-sm)] border px-4 py-3"
                  style={{ boxShadow: `inset 0 0 0 1px ${ic.ring}22` }}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${ic.cls}`}
                    style={{ background: 'currentColor', boxShadow: `0 0 10px ${ic.ring}66` }}
                  >
                    <span className="text-[#0b0d12]">{ic.glyph}</span>
                  </span>
                  <span className="flex-1 text-[13px]">{c.label}</span>
                  <span className={`text-right text-[12px] ${ic.cls}`}>{c.detail}</span>
                </li>
              );
            })}
          </ol>
        )}

        {/* 第三幕：评分 */}
        {showScore && (
          <div className="mt-8 flex animate-[fadeUp_.45s_ease-out] items-center justify-center gap-8">
            <ScoreRing score={risk.score} threshold={risk.threshold} size={132} />
            <div>
              <div className="text-muted text-[12px]">安全评分</div>
              <div className="mt-1 text-[15px] tabular-nums">
                及格线 {risk.threshold} / 100
              </div>
              {showVerdict && (
                <div className={`mt-3 animate-[fadeUp_.4s_ease-out] text-[24px] font-semibold ${v.cls}`}>
                  {v.label}
                </div>
              )}
            </div>
          </div>
        )}

        {showVerdict && (
          <p className="text-muted mt-6 animate-[fadeUp_.5s_ease-out] text-center text-[13px]">
            {v.hint}
          </p>
        )}
      </div>
    </div>
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
