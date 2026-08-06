import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  title: string;
  width?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
}

export default function Table<T>({ columns, rows, rowKey, onRowClick, loading, empty }: Props<T>) {
  if (loading) {
    return <div className="text-ink-4 py-20 text-center text-sm">加载中...</div>;
  }
  if (rows.length === 0) {
    return <div className="text-ink-4 py-20 text-center text-sm">{empty ?? '暂无数据'}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-line border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className="px-4 py-3 text-left text-xs font-semibold text-black/50"
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={
                onRowClick
                  ? 'border-line hover:bg-surface-hover transition-base cursor-pointer border-b'
                  : 'border-line border-b'
              }
            >
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-4">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
