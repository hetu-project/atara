import { useEffect, useState } from 'react';
import type { RiskCheck } from '@/demo/types';
import { useReducedMotion } from './useReducedMotion';

/**
 * 把一次性算好的检查项按节奏吐出来，制造「模型正在逐条推理」的观感。
 *
 * 结论早就由 assessRisk 算完了，这里只控制显示节奏——**没有任何网络请求，
 * 也没有任何真实推理在发生**。
 *
 * 节奏用 (i*137)%30 而不是随机数：每步 600–890ms 不等，等间隔看起来很假，
 * 纯随机又不可复现（同一笔单反复打开节奏会变）。
 */
export function useStreamingChecks(checks: RiskCheck[], enabled: boolean) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    if (reduced) {
      setCount(checks.length);
      return;
    }

    setCount(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      i += 1;
      setCount(i);
      if (i < checks.length) timer = setTimeout(tick, 600 + ((i * 137) % 30) * 10);
    };

    timer = setTimeout(tick, 450);
    return () => clearTimeout(timer);
  }, [checks, enabled, reduced]);

  return { revealed: checks.slice(0, count), done: count >= checks.length };
}

/** 流式跑完全部检查项需要的总时长，用于安排状态推进的时机。 */
export function streamingDurationMs(checkCount: number): number {
  let total = 450;
  for (let i = 1; i < checkCount; i++) total += 600 + ((i * 137) % 30) * 10;
  return total + 900;
}
