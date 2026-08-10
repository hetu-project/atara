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
  it('总是产出八项检查，覆盖四个模型组', () => {
    const { checks } = assessRisk(tx());
    expect(checks).toHaveLength(8);
    expect(new Set(checks.map((c) => c.group)).size).toBe(4);
    expect(checks.every((c) => c.model.length > 0)).toBe(true);
  });

  it('结论文字由实际检查结果拼出，不是写死的台词', () => {
    const a = assessRisk(tx({ id: 'tx_sum_a' }));
    const b = assessRisk(tx({ id: 'tx_sum_b' }));
    expect(a.summary).not.toBe(b.summary);
    expect(a.summary).toContain(String(a.score));
    expect(a.summary).toContain(String(a.confidence));
  });

  it('有问题项时结论必须点名问题项', () => {
    for (let i = 0; i < 60; i++) {
      const r = assessRisk(tx({ id: `tx_${i}` }));
      const flaws = r.checks.filter((c) => c.status !== 'pass');
      // 结论说「未触发风险信号」而屏幕上挂着橙色警告，是最容易穿帮的自相矛盾
      if (flaws.length > 0) {
        expect(r.summary).toContain(flaws[0].label);
        expect(r.summary).not.toContain('全部维度均未触发');
      } else {
        expect(r.summary).toContain('全部维度均未触发');
      }
    }
  });

  it('置信度落在 62..99', () => {
    for (let i = 0; i < 100; i++) {
      const { confidence } = assessRisk(tx({ id: `tx_${i}` }));
      expect(confidence).toBeGreaterThanOrEqual(62);
      expect(confidence).toBeLessThanOrEqual(99);
    }
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

  it('文案严重度与状态匹配：致命措辞只出现在 fail 项上', () => {
    // 把「命中国际制裁名单」配一个橙色「需留意」图标，是屏幕上最刺眼的自相矛盾。
    const FATAL_WORDING = [
      '命中国际制裁名单',
      '活体检测与证件照不匹配',
      '高风险司法辖区',
      '接触过混币服务',
      '欺诈团伙',
      '行为突变',
      '未了结',
      '明显异常',
    ];
    for (let i = 0; i < 200; i++) {
      for (const c of assessRisk(tx({ id: `tx_${i}` })).checks) {
        if (c.status === 'fail') continue;
        for (const w of FATAL_WORDING) {
          expect(c.detail).not.toContain(w);
        }
      }
    }
  });

  it('每次评估最多一个 fail 项', () => {
    for (let i = 0; i < 200; i++) {
      const fails = assessRisk(tx({ id: `tx_${i}` })).checks.filter((c) => c.status === 'fail');
      expect(fails.length).toBeLessThanOrEqual(1);
    }
  });

  it('补充材料后分数提高', () => {
    const first = assessRisk(tx({ id: 'tx_resub' }));
    const second = assessRisk(tx({ id: 'tx_resub', resubmits: 1 }));
    expect(second.score).toBeGreaterThan(first.score);
  });
});
