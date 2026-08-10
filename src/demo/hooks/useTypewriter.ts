import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * 逐字吐出一段文字。整个 Demo 里最像「大模型在说话」的一下。
 *
 * 文字本身早就由 riskEngine 拼好了（本地纯函数，无网络请求），这里只控制显示节奏。
 */
export function useTypewriter(text: string, enabled: boolean, msPerChar = 18) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!enabled) return setN(0);
    if (reduced) return setN(text.length);

    setN(0);
    let i = 0;
    const timer = setInterval(() => {
      // 一次吐 2 个字，中文按字计太慢，读起来会拖
      i = Math.min(text.length, i + 2);
      setN(i);
      if (i >= text.length) clearInterval(timer);
    }, msPerChar);

    // rAF 之外也给个兜底：后台标签页里 setInterval 会被节流，回来时直接补全
    const failsafe = setTimeout(() => setN(text.length), text.length * msPerChar + 1200);

    return () => {
      clearInterval(timer);
      clearTimeout(failsafe);
    };
  }, [text, enabled, reduced, msPerChar]);

  return { shown: text.slice(0, n), done: n >= text.length };
}
