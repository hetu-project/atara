import { describe, expect, it } from 'vitest';
import { challengeFromRisk } from '@/demo/engine/challenge';
import type { RiskCheck, RiskResult } from '@/demo/types';

function check(over: Partial<RiskCheck> & Pick<RiskCheck, 'id' | 'label' | 'status' | 'detail'>): RiskCheck {
  return { group: '身份核验', model: 'test-model-v1', latencyMs: 200, ...over };
}

function risk(over: Partial<RiskResult> = {}): RiskResult {
  return {
    score: 58,
    threshold: 70,
    verdict: 'challenge',
    confidence: 80,
    featureCount: 240,
    summary: '测试用结论',
    checks: [
      check({ id: 'kyc', label: '身份一致性比对', status: 'warn', detail: '登记地址与证件签发地不一致' }),
      check({ id: 'credit', label: '对手方信用评估', status: 'pass', detail: '93 笔履约 · 0 次纠纷' }),
      check({ id: 'amount', label: '金额分位与异常检测', status: 'warn', detail: '是你平时单量的 4.2 倍' }),
    ],
    ...over,
  };
}

describe('challengeFromRisk', () => {
  it('原因列出全部问题项，不只第一条', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.reason).toContain('身份一致性比对');
    expect(c.reason).toContain('金额分位与异常检测');
    expect(c.reason).not.toContain('对手方信用评估');
  });

  it('所需材料是各问题项的并集且去重', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.required).toEqual(['对方实名证件', '账户授权书', '资金来源证明', '交易背景说明']);
    expect(new Set(c.required).size).toBe(c.required.length);
  });

  it('没有问题项时回落到评分说明', () => {
    const clean = risk({
      checks: [check({ id: 'kyc', label: '身份一致性比对', status: 'pass', detail: '已通过' })],
    });
    const c = challengeFromRisk('ch_1', 'tx_1', clean, '2026-08-09T10:00:00Z');
    expect(c.reason).toBe('安全评分 58 未达到及格线 70');
    expect(c.required).toEqual(['补充交易背景说明']);
  });

  it('新建的待办是待处理状态', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.state).toBe('open');
    expect(c.txId).toBe('tx_1');
  });
});
