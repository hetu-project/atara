import Button from './Button';

interface Props {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, total, pageSize, onChange }: Props) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-end gap-4 py-4 text-sm">
      <span className="text-ink-4">共 {total} 条</span>
      <Button variant="second" size="md" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span className="text-ink-3">
        {page} / {pageCount}
      </span>
      <Button variant="second" size="md" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        下一页
      </Button>
    </div>
  );
}
