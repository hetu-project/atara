import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusTimeline from '@/features/orders/StatusTimeline';
import type { OrderStatusLog } from '@/lib/schema';

const logs: OrderStatusLog[] = [
  {
    id: '1',
    order_id: 'o',
    from_status: null,
    to_status: 'pending_payment',
    changed_by: null,
    created_at: '2026-08-06T01:00:00Z',
  },
  {
    id: '2',
    order_id: 'o',
    from_status: 'pending_payment',
    to_status: 'paid',
    changed_by: null,
    created_at: '2026-08-06T02:00:00Z',
  },
];

describe('StatusTimeline', () => {
  it('首条显示为创建订单', () => {
    render(<StatusTimeline logs={logs} loading={false} />);
    expect(screen.getByText('创建订单，状态为 待付款')).toBeInTheDocument();
  });

  it('后续条目显示状态流转', () => {
    render(<StatusTimeline logs={logs} loading={false} />);
    expect(screen.getByText('待付款 → 已付款')).toBeInTheDocument();
  });

  it('无记录时显示占位', () => {
    render(<StatusTimeline logs={[]} loading={false} />);
    expect(screen.getByText('暂无状态记录')).toBeInTheDocument();
  });

  it('加载中显示加载态', () => {
    render(<StatusTimeline logs={[]} loading />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
