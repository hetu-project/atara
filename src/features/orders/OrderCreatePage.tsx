import { useNavigate } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, useToast } from '@/components/ui';
import type { OrderInput } from '@/lib/schema';
import OrderForm from './OrderForm';
import { useCreateOrder } from './hooks';

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateOrder();

  return (
    <>
      <PageHeader
        title="新建订单"
        actions={
          <Button variant="second" onClick={() => navigate('/orders')}>
            返回列表
          </Button>
        }
      />
      <OrderForm
        submitting={create.isPending}
        onSubmit={(values: OrderInput) =>
          create.mutate(values, {
            onSuccess: (order) => {
              toast.success(`创建成功，订单号 ${order.order_no}`);
              navigate(`/orders/${order.id}`, { replace: true });
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }
      />
    </>
  );
}
