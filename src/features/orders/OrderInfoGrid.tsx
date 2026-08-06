import { Link } from 'react-router';
import { ORDER_TYPE_LABEL, PAYEE_LABEL, formatAmount, formatDateTime } from '@/lib/format';
import type { OrderWithParties } from '@/lib/schema';

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-black/50">{label}</p>
      <p className="text-sm font-medium break-all">{children ?? '-'}</p>
    </div>
  );
}

export default function OrderInfoGrid({ order }: { order: OrderWithParties }) {
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-5">
      <Item label="订单号">{order.order_no}</Item>
      <Item label="订单类型">{ORDER_TYPE_LABEL[order.order_type]}</Item>
      <Item label="收款方">{PAYEE_LABEL[order.payee]}</Item>

      <Item label="买家">
        {order.buyer ? (
          <Link className="underline" to={`/buyers/${order.buyer.id}`}>
            {order.buyer.full_name}（{order.buyer.display_id}）
          </Link>
        ) : null}
      </Item>
      <Item label="卖家">
        {order.seller ? (
          <Link className="underline" to={`/sellers/${order.seller.id}`}>
            {order.seller.full_name}（{order.seller.display_id}）
          </Link>
        ) : null}
      </Item>
      <Item label="金额">
        {order.order_type === 'crypto'
          ? `${formatAmount(order.amount, 8)} ${order.asset ?? ''}`
          : `${formatAmount(order.amount)} ${order.fiat_currency ?? ''}`}
      </Item>

      {order.order_type === 'crypto' ? (
        <>
          <Item label="链">{order.chain}</Item>
          <div className="col-span-2">
            <Item label="收款地址">{order.receiving_address}</Item>
          </div>
        </>
      ) : (
        <>
          <Item label="银行名称">{order.bank_name}</Item>
          <Item label="银行户名">{order.bank_account_name}</Item>
          <Item label="收款账号">{order.bank_account_number}</Item>
          <Item label="SWIFT / IFSC">{order.bank_swift}</Item>
        </>
      )}

      <Item label="创建时间">{formatDateTime(order.created_at)}</Item>
      <Item label="更新时间">{formatDateTime(order.updated_at)}</Item>
      <div className="col-span-3">
        <Item label="备注">{order.note}</Item>
      </div>
    </div>
  );
}
