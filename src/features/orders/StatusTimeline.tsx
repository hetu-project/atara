import { ORDER_STATUS_LABEL, formatDateTime } from '@/lib/format';
import type { OrderStatusLog } from '@/lib/schema';

export default function StatusTimeline({ logs, loading }: { logs: OrderStatusLog[]; loading: boolean }) {
  if (loading) return <p className="text-ink-4 py-6 text-sm">加载中...</p>;
  if (logs.length === 0) return <p className="text-ink-4 py-6 text-sm">暂无状态记录</p>;

  return (
    <ol className="relative pl-5">
      {logs.map((log) => (
        <li key={log.id} className="border-line relative border-l pb-6 pl-5 last:border-l-0 last:pb-0">
          <span className="bg-primary absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full" />
          <p className="text-sm font-semibold">
            {log.from_status
              ? `${ORDER_STATUS_LABEL[log.from_status]} → ${ORDER_STATUS_LABEL[log.to_status]}`
              : `创建订单，状态为 ${ORDER_STATUS_LABEL[log.to_status]}`}
          </p>
          <p className="text-ink-4 mt-1 text-xs">{formatDateTime(log.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
