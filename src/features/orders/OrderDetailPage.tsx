import { useNavigate, useParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import QueryState from '@/components/QueryState';
import { Button, useToast } from '@/components/ui';
import { useMyProfiles } from '@/features/counterparties/hooks';
import { ORDER_STATUS_LABEL } from '@/lib/format';
import type { OrderStatus } from '@/lib/schema';
import OrderInfoGrid from './OrderInfoGrid';
import OrderStatusBadge from './OrderStatusBadge';
import StatusActions from './StatusActions';
import { roleContextFor } from './statusMachine';
import StatusTimeline from './StatusTimeline';
import { useOrder, useOrderStatusLogs, useUpdateOrderStatus } from './hooks';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const order = useOrder(id);
  const logs = useOrderStatusLogs(id);
  const updateStatus = useUpdateOrderStatus(id ?? '');
  const profiles = useMyProfiles();

  if (order.isLoading) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (order.isError) return <div className="text-danger text-sm">加载失败：{(order.error as Error).message}</div>;
  if (!order.data) return null;

  const roleContext = roleContextFor(order.data, new Set((profiles.data ?? []).map((p) => p.id)));

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

      <div className="rounded-card bg-surface mb-5 flex flex-wrap items-center gap-5 px-6 py-4">
        <span className="text-sm text-black/50">当前状态</span>
        <OrderStatusBadge status={order.data.status} />
        {profiles.isPending ? (
          <span className="text-ink-4 text-xs">加载中...</span>
        ) : profiles.isError ? (
          <span className="text-danger text-xs">档案加载失败，无法判断你在本订单中的角色</span>
        ) : (
          <StatusActions
            context={roleContext}
            pending={updateStatus.isPending}
            onChange={handleStatusChange}
          />
        )}
      </div>

      <div className="rounded-card bg-surface mb-5 p-6">
        <h2 className="mb-5 text-sm font-semibold">订单信息</h2>
        <OrderInfoGrid order={order.data} />
      </div>

      <div className="rounded-card bg-surface p-6">
        <h2 className="mb-5 text-sm font-semibold">状态变更记录</h2>
        {logs.isError ? (
          <QueryState isError error={logs.error} />
        ) : (
          <StatusTimeline logs={logs.data ?? []} loading={logs.isLoading} />
        )}
      </div>
    </>
  );
}
