import { describe, expect, it } from 'vitest';
import { assessRisk, THRESHOLD } from '@/demo/engine/riskEngine';
import type { Transaction } from '@/demo/types';

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx_1',
    poolOrderId: 'po_1',
    side: 'buy',
    asset: 'USDT',
    amount: 5000,
    fiatTotal: 5000,
    fiatCurrency: 'USD',
    counterparty: {
      displayId: 'D999999',
      name: 'Meridian Capital',
      score: 88,
      completedTrades: 60,
      disputes: 0,
      avgResponseMin: 4,
      verified: true,
      firstSeenAt: '2025-06-01T00:00:00Z',
    },
    status: 'validating',
    createdAt: '2026-08-09T10:00:00Z',
    risk: null,
    resubmits: 0,
    ...over,
  };
}

describe('assessRisk', () => {
  it('总是产出六项检查', () => {
    expect(assessRisk(tx()).checks).toHaveLength(6);
  });

  it('同一笔交易反复评估结果一致', () => {
    expect(assessRisk(tx())).toEqual(assessRisk(tx()));
  });

  it('不同交易结果不同', () => {
    expect(assessRisk(tx({ id: 'tx_a' }))).not.toEqual(assessRisk(tx({ id: 'tx_b' })));
  });

  it('分数始终落在 0..100', () => {
    for (let i = 0; i < 100; i++) {
      const { score } = assessRisk(tx({ id: `tx_${i}` }));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('分数与裁决自洽', () => {
    for (let i = 0; i < 100; i++) {
      const { score, verdict } = assessRisk(tx({ id: `tx_${i}` }));
      const expected = score >= THRESHOLD ? 'pass' : score >= 50 ? 'challenge' : 'decline';
      expect(verdict).toBe(expected);
    }
  });

  it('分数与问题项自洽：放行的单不该出现 fail，未放行的单必须看得到问题', () => {
    for (let i = 0; i < 100; i++) {
      const r = assessRisk(tx({ id: `tx_${i}` }));
      if (r.verdict === 'pass') {
        expect(r.checks.some((c) => c.status === 'fail')).toBe(false);
      } else {
        expect(r.checks.some((c) => c.status !== 'pass')).toBe(true);
      }
    }
  });

  it('补充材料后分数提高', () => {
    const first = assessRisk(tx({ id: 'tx_resub' }));
    const second = assessRisk(tx({ id: 'tx_resub', resubmits: 1 }));
    expect(second.score).toBeGreaterThan(first.score);
  });
});
