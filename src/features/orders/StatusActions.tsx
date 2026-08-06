import { Button } from '@/components/ui';
import type { OrderStatus } from '@/lib/schema';
import { allowedTransitions, type OrderRoleContext } from './statusMachine';

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending_payment: '标记为待付款',
  paid: '我已付款',
  completed: '确认收款完成',
  cancelled: '取消订单',
};

export default function StatusActions({
  context,
  pending,
  onChange,
}: {
  context: OrderRoleContext;
  pending: boolean;
  onChange: (next: OrderStatus) => void;
}) {
  const next = allowedTransitions(context);

  if (next.length === 0) {
    return (
      <span className="text-ink-4 text-xs">
        {context.status === 'completed' || context.status === 'cancelled'
          ? '订单已结束，无法再变更'
          : '当前状态下你没有可执行的操作'}
      </span>
    );
  }

  return (
    <div className="flex gap-3">
      {next.map((s) => (
        <Button
          key={s}
          variant={s === 'cancelled' ? 'second' : 'primary'}
          disabled={pending}
          onClick={() => onChange(s)}
        >
          {ACTION_LABEL[s]}
        </Button>
      ))}
    </div>
  );
}
