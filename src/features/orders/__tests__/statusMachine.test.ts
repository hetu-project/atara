import { describe, expect, it } from 'vitest';
import { allowedTransitions, roleContextFor } from '../statusMachine';

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

describe('roleContextFor', () => {
  const base = { status: 'pending_payment' as const, buyer_id: 'B', seller_id: 'S' };

  it('payee=buyer 时，持有买家档案的人是收款方', () => {
    const ctx = roleContextFor({ ...base, payee: 'buyer' }, new Set(['B']));
    expect(ctx.isPayee).toBe(true);
    expect(ctx.isPayer).toBe(false);
  });

  it('payee=buyer 时，持有卖家档案的人是付款方', () => {
    const ctx = roleContextFor({ ...base, payee: 'buyer' }, new Set(['S']));
    expect(ctx.isPayee).toBe(false);
    expect(ctx.isPayer).toBe(true);
  });

  it('payee=seller 时收付方对调', () => {
    const ctx = roleContextFor({ ...base, payee: 'seller' }, new Set(['S']));
    expect(ctx.isPayee).toBe(true);
    expect(ctx.isPayer).toBe(false);
  });

  it('与订单无关的人两边都不是', () => {
    const ctx = roleContextFor({ ...base, payee: 'buyer' }, new Set(['X']));
    expect(ctx.isPayee).toBe(false);
    expect(ctx.isPayer).toBe(false);
  });

  it('同时持有买卖两个档案时两边都是（自己跟自己下单）', () => {
    const ctx = roleContextFor({ ...base, payee: 'buyer' }, new Set(['B', 'S']));
    expect(ctx.isPayee).toBe(true);
    expect(ctx.isPayer).toBe(true);
  });
});
