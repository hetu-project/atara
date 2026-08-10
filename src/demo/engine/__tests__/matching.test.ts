import { describe, expect, it } from 'vitest';
import { matchOrder, pickBestMatch } from '@/demo/engine/matching';
import type { Desk, PoolOrder } from '@/demo/types';

function desk(over: Partial<Desk> = {}): Desk {
  return {
    kind: 'buy',
    displayId: 'D000001',
    name: '我的买入账户',
    verifiedAt: '2026-05-01T00:00:00Z',
    completedTrades: 10,
    disputes: 0,
    avgResponseMin: 4,
    ...over,
  };
}

describe('matchOrder', () => {
  it('账户已开通就能成交', () => {
    expect(matchOrder(desk())).toEqual({ ok: true });
  });

  it('账户未开通时拒绝，且提示对应的账户类型', () => {
    expect(matchOrder(desk({ verifiedAt: null }))).toEqual({
      ok: false,
      reason: '请先开通买入账户',
    });
    expect(matchOrder(desk({ kind: 'sell', verifiedAt: null }))).toEqual({
      ok: false,
      reason: '请先开通卖出账户',
    });
  });
});

function order(over: Partial<PoolOrder> = {}): PoolOrder {
  return {
    id: 'po_1',
    side: 'sell',
    asset: 'BTC',
    chain: 'BTC',
    amount: 1,
    fiatCurrency: 'USD',
    price: 94_200,
    fiatTotal: 94_200,
    counterparty: {
      displayId: 'D900001',
      name: 'Meridian Capital',
      score: 80,
      completedTrades: 40,
      disputes: 0,
      avgResponseMin: 5,
      verified: true,
      firstSeenAt: '2025-01-01T00:00:00Z',
    },
    postedAt: '2026-08-10T09:00:00Z',
    expiresAt: '2026-08-10T12:00:00Z',
    ...over,
  };
}

function withScore(id: string, score: number, over: Partial<PoolOrder> = {}): PoolOrder {
  return order({ id, ...over, counterparty: { ...order().counterparty, displayId: id, score } });
}

describe('pickBestMatch', () => {
  it('我要买就只看别人的卖单', () => {
    const pool = [withScore('sellA', 70), withScore('buyB', 99, { side: 'buy' })];
    const hit = pickBestMatch(pool, { asset: 'BTC', side: 'buy', amount: 1 });
    expect(hit?.id).toBe('sellA');
  });

  it('我要卖就只看别人的买单', () => {
    const pool = [withScore('sellA', 99), withScore('buyB', 70, { side: 'buy' })];
    const hit = pickBestMatch(pool, { asset: 'BTC', side: 'sell', amount: 1 });
    expect(hit?.id).toBe('buyB');
  });

  it('优先取信用分最高的对手方', () => {
    const pool = [withScore('low', 61), withScore('high', 97), withScore('mid', 80)];
    expect(pickBestMatch(pool, { asset: 'BTC', side: 'buy', amount: 1 })?.id).toBe('high');
  });

  it('信用分相同时取金额更接近的那笔', () => {
    const pool = [withScore('far', 90, { amount: 10 }), withScore('near', 90, { amount: 2 })];
    expect(pickBestMatch(pool, { asset: 'BTC', side: 'buy', amount: 2.1 })?.id).toBe('near');
  });

  it('币种不匹配时返回 null', () => {
    expect(pickBestMatch([withScore('a', 90)], { asset: 'ETH', side: 'buy', amount: 1 })).toBeNull();
  });

  it('空池返回 null', () => {
    expect(pickBestMatch([], { asset: 'BTC', side: 'buy', amount: 1 })).toBeNull();
  });
});
