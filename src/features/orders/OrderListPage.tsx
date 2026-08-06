import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, Input, Pagination, Select, Table, type Column } from '@/components/ui';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  formatAmount,
  formatDateTime,
  shortenAddress,
} from '@/lib/format';
import { ORDER_STATUSES, ORDER_TYPES, type OrderStatus, type OrderType, type OrderWithParties } from '@/lib/schema';
import OrderStatusBadge from './OrderStatusBadge';
import { useOrderList } from './hooks';

const PAGE_SIZE = 20;
const TYPE_OPTIONS = ORDER_TYPES.map((v) => ({ value: v, label: ORDER_TYPE_LABEL[v] }));
const STATUS_OPTIONS = ORDER_STATUSES.map((v) => ({ value: v, label: ORDER_STATUS_LABEL[v] }));

export default function OrderListPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [orderType, setOrderType] = useState<OrderType | ''>('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useOrderList({
    page,
    pageSize: PAGE_SIZE,
    orderType: orderType || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    keyword: search || undefined,
  });

  const columns: Column<OrderWithParties>[] = [
    { key: 'order_no', title: '订单号', width: '180px', render: (r) => <span className="font-semibold">{r.order_no}</span> },
    { key: 'order_type', title: '类型', width: '90px', render: (r) => ORDER_TYPE_LABEL[r.order_type] },
    { key: 'buyer', title: '买家', render: (r) => r.buyer ? `${r.buyer.full_name} (${r.buyer.display_id})` : '-' },
    { key: 'seller', title: '卖家', render: (r) => r.seller ? `${r.seller.full_name} (${r.seller.display_id})` : '-' },
    {
      key: 'amount',
      title: '金额',
      width: '180px',
      render: (r) =>
        r.order_type === 'crypto'
          ? `${formatAmount(r.amount, 8)} ${r.asset ?? ''}`
          : `${formatAmount(r.amount)} ${r.fiat_currency ?? ''}`,
    },
    {
      key: 'payto',
      title: '收款信息',
      width: '180px',
      render: (r) =>
        r.order_type === 'crypto'
          ? `${shortenAddress(r.receiving_address)}${r.chain ? ` · ${r.chain}` : ''}`
          : shortenAddress(r.bank_account_number, 4, 4),
    },
    { key: 'status', title: '状态', width: '110px', render: (r) => <OrderStatusBadge status={r.status} /> },
    { key: 'created_at', title: '创建时间', width: '160px', render: (r) => formatDateTime(r.created_at) },
  ];

  function reset(fn: () => void) {
    setPage(1);
    fn();
  }

  return (
    <>
      <PageHeader title="订单管理" actions={<Button onClick={() => navigate('/orders/new')}>新建订单</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="w-[140px]"
          options={TYPE_OPTIONS}
          placeholder="全部类型"
          value={orderType}
          onChange={(e) => reset(() => setOrderType(e.target.value as OrderType | ''))}
        />
        <Select
          className="w-[140px]"
          options={STATUS_OPTIONS}
          placeholder="全部状态"
          value={status}
          onChange={(e) => reset(() => setStatus(e.target.value as OrderStatus | ''))}
        />
        <Input
          className="w-[160px]"
          type="date"
          value={dateFrom}
          onChange={(e) => reset(() => setDateFrom(e.target.value))}
        />
        <span className="text-ink-4">至</span>
        <Input
          className="w-[160px]"
          type="date"
          value={dateTo}
          onChange={(e) => reset(() => setDateTo(e.target.value))}
        />
        <Input
          className="w-[220px]"
          placeholder="搜索订单号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reset(() => setSearch(keyword))}
        />
        <Button variant="second" onClick={() => reset(() => setSearch(keyword))}>
          搜索
        </Button>
      </div>

      <div className="rounded-card bg-surface p-2">
        <Table
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => navigate(`/orders/${r.id}`)}
          empty="暂无订单，点右上角新建"
        />
      </div>

      <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
