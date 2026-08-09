import type { ReactNode } from 'react';

/**
 * Trustline 每个列表页顶上那行：
 * `No X filters applied` / Filters / N loaded / Sorted by created descending / Columns / Reset
 *
 * **这一行全是装饰**，点了不改任何数据。真正的筛选由各页自己的下拉控件负责。
 * 留着它是因为它是「这是个真产品」观感的主要来源之一，成本几乎为零。
 * 别在这里加真实逻辑——想加筛选就在页面上加控件。
 */
export default function FilterBar({
  summary,
  loaded,
  children,
}: {
  summary: string;
  loaded: number;
  children?: ReactNode;
}) {
  return (
    <div className="border-hairline bg-surface mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-panel)] border px-[18px] py-3 text-[12px]">
      <span className="text-muted">{summary}</span>
      <span className="ml-auto flex items-center gap-4">
        {children}
        <Chip>筛选</Chip>
        <span className="text-muted tabular-nums">{loaded} 已加载</span>
        <span className="text-muted">按创建时间倒序</span>
        <Chip>列</Chip>
        <Chip>重置</Chip>
      </span>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="border-hairline text-muted hover:text-txt hover:border-hairline-strong rounded-[6px] border px-2 py-1 transition-colors"
    >
      {children}
    </button>
  );
}
