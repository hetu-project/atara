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
import { isPayeeSide } from './statusMachine';
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

  // 判定当前用户在这笔订单里的位置。
  // 收款方由 payee 列决定（'buyer' 表示钱付给买家），绝不能用 order_type 推断 ——
  // crypto 默认买家收币只是表单默认值，用户可以改。
  const myIds = new Set((profiles.data ?? []).map((p) => p.id));
  const iAmBuyer = myIds.has(order.data.buyer_id);
  const iAmSeller = myIds.has(order.data.seller_id);
  const payeeIsBuyer = isPayeeSide(order.data.payee, 'buyer');
  const roleContext = {
    status: order.data.status,
    isPayee: payeeIsBuyer ? iAmBuyer : iAmSeller,
    isPayer: payeeIsBuyer ? iAmSeller : iAmBuyer,
  };

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
