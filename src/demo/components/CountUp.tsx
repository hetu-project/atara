import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';

/**
 * 数字滚动。缓动 1-(1-t)³，末尾收得慢，比线性有质感。
 *
 * 从**上一个值**滚到新值，不是每次从 0 开始。订单池每 8 秒进一笔新单，
 * 若每次都从 0 数起，磁贴会当着用户的面闪回 0 再爬上来。
 */
export default function CountUp({
  value,
  durationMs = 900,
  decimals = 0,
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    from.current = value;

    const step = (now: number) => {
      // 夹到 [0,1]：rAF 的时间戳未必与 performance.now() 同源，t 为负会算出
      // 负的显示值（toFixed 后是刺眼的「-0」）。
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);

    // 兜底：rAF 在后台标签页会暂停，在某些无头环境里根本不推进。没有这个
    // 定时器的话，数字会永远停在起点——磁贴显示 0 是最难堪的失败。
    // 落地页对 GSAP ticker 也有同样的失效保护。
    const failsafe = setTimeout(() => setShown(value), durationMs + 120);

    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(failsafe);
    };
  }, [value, durationMs, reduced]);

  return <>{shown.toFixed(decimals)}</>;
}
