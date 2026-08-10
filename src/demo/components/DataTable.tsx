import type { ReactNode } from 'react';

export interface Column {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right';
}

export interface Row {
  id: string;
  cells: ReactNode[];
  /** 首行滑入动画用。见 OrderPoolPage 里判断「新单」的逻辑。 */
  isNew?: boolean;
}

export default function DataTable({
  columns,
  rows,
  empty,
  onRowClick,
}: {
  columns: Column[];
  rows: Row[];
  empty: string;
  onRowClick?: (id: string) => void;
}) {
  return (
    <div className="border-hairline bg-surface overflow-hidden rounded-[var(--radius-panel)] border">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-raised border-hairline border-b">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={`text-muted px-[18px] py-3 text-[11px] font-semibold tracking-[0.08em] ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-muted px-[18px] py-16 text-center">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={onRowClick ? () => onRowClick(r.id) : undefined}
                  className={`border-hairline hover:bg-surface-raised border-b transition-colors last:border-b-0 ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${r.isNew ? 'animate-[slideIn_.45s_ease-out]' : ''}`}
                  style={
                    r.isNew
                      ? {
                          boxShadow:
                            'inset 0 0 0 1px color-mix(in oklab, var(--color-brand) 34%, transparent)',
                        }
                      : undefined
                  }
                >
                  {r.cells.map((cell, i) => (
                    <td
                      key={columns[i].key}
                      className={`px-[18px] py-[14px] align-middle ${
                        columns[i].align === 'right' ? 'text-right' : ''
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页是装饰，Demo 一页显示完 */}
      <div className="border-hairline text-muted flex items-center justify-between border-t px-[18px] py-3 text-[12px]">
        <span className="tabular-nums">共 {rows.length} 条</span>
        <span className="flex gap-2">
          <span className="border-hairline rounded-[6px] border px-2 py-1 opacity-40">上一页</span>
          <span className="border-hairline rounded-[6px] border px-2 py-1 opacity-40">下一页</span>
        </span>
      </div>
    </div>
  );
}
