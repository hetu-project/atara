import { describe, expect, it } from 'vitest';
import { matchOrder } from '@/demo/engine/matching';
import type { Desk } from '@/demo/types';

function desk(over: Partial<Desk> = {}): Desk {
  return {
    kind: 'buy',
    displayId: 'D000001',
    name: '我的买方席位',
    verifiedAt: '2026-05-01T00:00:00Z',
    completedTrades: 10,
    disputes: 0,
    avgResponseMin: 4,
    ...over,
  };
}

describe('matchOrder', () => {
  it('席位已开通就能撮合', () => {
    expect(matchOrder(desk())).toEqual({ ok: true });
  });

  it('席位未开通时拒绝，且提示对应的席位类型', () => {
    expect(matchOrder(desk({ verifiedAt: null }))).toEqual({
      ok: false,
      reason: '请先开通买方席位',
    });
    expect(matchOrder(desk({ kind: 'sell', verifiedAt: null }))).toEqual({
      ok: false,
      reason: '请先开通卖方席位',
    });
  });
});
