import { describe, expect, it } from 'vitest';
import { matchOrder } from '@/demo/engine/matching';
import type { Desk } from '@/demo/types';

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
