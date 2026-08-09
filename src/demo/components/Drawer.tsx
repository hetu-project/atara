import { useEffect, type ReactNode } from 'react';
import { useReducedMotion } from '@/demo/hooks/useReducedMotion';

export default function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/55 ${
          reduced ? '' : 'transition-opacity duration-300'
        } ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`bg-surface border-hairline fixed inset-y-0 right-0 z-50 flex w-[560px] max-w-full flex-col border-l shadow-[var(--shadow-panel)] ${
          reduced ? '' : 'transition-transform duration-300 ease-out'
        } ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="border-hairline flex shrink-0 items-center justify-between border-b px-6 py-5">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-muted hover:text-txt text-[20px] leading-none transition-colors"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{open && children}</div>
      </aside>
    </>
  );
}
