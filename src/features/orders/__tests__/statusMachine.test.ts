import { describe, expect, it } from 'vitest';
import { allowedTransitions } from '../statusMachine';

describe('allowedTransitions', () => {
  it('待付款：付款方可标已付款、可取消', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: true, isPayee: false })).toEqual([
      'paid',
      'cancelled',
    ]);
  });

  it('待付款：收款方只能取消，不能替对方标已付款', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: false, isPayee: true })).toEqual([
      'cancelled',
    ]);
  });

  it('已付款：收款方可确认完成', () => {
    expect(allowedTransitions({ status: 'paid', isPayer: false, isPayee: true })).toEqual(['completed']);
  });

  it('已付款：付款方无操作 —— 钱到没到只有收款方知道', () => {
    expect(allowedTransitions({ status: 'paid', isPayer: true, isPayee: false })).toEqual([]);
  });

  it('已付款不可再取消', () => {
    const next = allowedTransitions({ status: 'paid', isPayer: true, isPayee: true });
    expect(next).not.toContain('cancelled');
  });

  it('终态无任何后续', () => {
    expect(allowedTransitions({ status: 'completed', isPayer: true, isPayee: true })).toEqual([]);
    expect(allowedTransitions({ status: 'cancelled', isPayer: true, isPayee: true })).toEqual([]);
  });

  it('既不是买方也不是卖方则无操作（正常情况下 RLS 已挡住，此处兜底）', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: false, isPayee: false })).toEqual([]);
  });

  it('同时持有买卖两个档案（自己跟自己下单）时两种操作都可用', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: true, isPayee: true })).toEqual([
      'paid',
      'cancelled',
    ]);
  });
});
