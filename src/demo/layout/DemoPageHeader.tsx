import type { ReactNode } from 'react';

export default function DemoPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-[26px] flex items-end justify-between gap-6">
      <div>
        <h1 className="text-[34px] leading-none font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-2.5 text-[14px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2.5">{actions}</div>}
    </div>
  );
}

/** 页头右侧那些按钮。纯装饰——点了不做任何事，只为让页面看起来像真产品。 */
export function HeaderButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="border-hairline bg-surface text-muted hover:text-txt hover:border-hairline-strong h-[34px] rounded-[var(--radius-xs)] border px-3.5 text-[13px] transition-colors"
    >
      {children}
    </button>
  );
}
