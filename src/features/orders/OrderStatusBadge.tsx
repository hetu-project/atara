import { Badge } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/format';
import type { OrderStatus } from '@/lib/schema';

const TONE = {
  pending_payment: 'neutral',
  paid: 'accent',
  completed: 'success',
  cancelled: 'outline',
} as const;

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
