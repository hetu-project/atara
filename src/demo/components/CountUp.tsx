import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';

/** 数字滚动。缓动用 1-(1-t)³，末尾收得慢，比线性有质感。 */
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
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const from = 0;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs, reduced]);

  return <>{shown.toFixed(decimals)}</>;
}
