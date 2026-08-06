import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from './cn';

interface ToastItem {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // 记下所有待触发的自动消失定时器，卸载时一并清掉。
  // 不清的话，测试里挂载 ToastProvider 又快速卸载会触发
  // "update on unmounted component" 警告，把测试输出弄脏。
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const push = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, tone, message }]);
    const timer = window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      timers.current = timers.current.filter((t) => t !== timer);
    }, 3000);
    timers.current.push(timer);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {items.map((i) => (
          <div
            key={i.id}
            className={cn(
              'rounded-pill shadow-float px-5 py-2.5 text-sm font-semibold',
              i.tone === 'success' ? 'bg-primary text-black' : 'bg-danger text-white',
            )}
          >
            {i.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
