import { describe, expect, it } from 'vitest';
import { challengeFromRisk } from '@/demo/engine/challenge';
import type { RiskResult } from '@/demo/types';

function risk(over: Partial<RiskResult> = {}): RiskResult {
  return {
    score: 58,
    threshold: 70,
    verdict: 'challenge',
    checks: [
      { id: 'kyc', label: '核对席位实名状态', status: 'warn', detail: '对手方未完成实名认证' },
      { id: 'history', label: '拉取对手方历史成交', status: 'pass', detail: '93 笔完成 · 0 争议' },
      { id: 'amount', label: '金额异常检测', status: 'warn', detail: '高于席位均值 4.2×' },
    ],
    ...over,
  };
}

describe('challengeFromRisk', () => {
  it('原因列出全部问题项，不只第一条', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.reason).toContain('核对席位实名状态');
    expect(c.reason).toContain('金额异常检测');
    expect(c.reason).not.toContain('拉取对手方历史成交');
  });

  it('所需材料是各问题项的并集且去重', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.required).toEqual([
      '对手方实名证件',
      '席位授权书',
      '资金来源证明',
      '交易背景说明',
    ]);
    expect(new Set(c.required).size).toBe(c.required.length);
  });

  it('没有问题项时回落到评分说明', () => {
    const clean = risk({
      checks: [{ id: 'kyc', label: '核对席位实名状态', status: 'pass', detail: '已验证' }],
    });
    const c = challengeFromRisk('ch_1', 'tx_1', clean, '2026-08-09T10:00:00Z');
    expect(c.reason).toBe('风控评分 58 低于阈值 70');
    expect(c.required).toEqual(['补充交易背景说明']);
  });

  it('新建的挡单是待处理状态', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.state).toBe('open');
    expect(c.txId).toBe('tx_1');
  });
});
