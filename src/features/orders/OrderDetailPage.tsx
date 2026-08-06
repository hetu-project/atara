import { useNavigate, useParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, Select, useToast } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/format';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/schema';
import OrderInfoGrid from './OrderInfoGrid';
import OrderStatusBadge from './OrderStatusBadge';
import StatusTimeline from './StatusTimeline';
import { useOrder, useOrderStatusLogs, useUpdateOrderStatus } from './hooks';

const STATUS_OPTIONS = ORDER_STATUSES.map((v) => ({ value: v, label: ORDER_STATUS_LABEL[v] }));

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const order = useOrder(id);
  const logs = useOrderStatusLogs(id);
  const updateStatus = useUpdateOrderStatus(id ?? '');

  if (order.isLoading) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (order.isError) return <div className="text-danger text-sm">加载失败：{(order.error as Error).message}</div>;
  if (!order.data) return null;

  function handleStatusChange(next: OrderStatus) {
    if (next === order.data!.status) return;
    updateStatus.mutate(next, {
      onSuccess: () => toast.success(`已更新为「${ORDER_STATUS_LABEL[next]}」`),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <>
      <PageHeader
        title="订单详情"
        actions={
          <Button variant="second" onClick={() => navigate('/orders')}>
            返回列表
          </Button>
        }
      />

      <div className="rounded-card bg-surface mb-5 flex items-center gap-5 px-6 py-4">
        <span className="text-sm text-black/50">当前状态</span>
        <OrderStatusBadge status={order.data.status} />
        <Select
          className="w-[160px]"
          options={STATUS_OPTIONS}
          value={order.data.status}
          disabled={updateStatus.isPending}
          onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
        />
        <span className="text-ink-4 text-xs">状态可在四种之间手动切换，每次变更都会记录</span>
      </div>

      <div className="rounded-card bg-surface mb-5 p-6">
        <h2 className="mb-5 text-sm font-semibold">订单信息</h2>
        <OrderInfoGrid order={order.data} />
      </div>

      <div className="rounded-card bg-surface p-6">
        <h2 className="mb-5 text-sm font-semibold">状态变更记录</h2>
        <StatusTimeline logs={logs.data ?? []} loading={logs.isLoading} />
      </div>
    </>
  );
}
