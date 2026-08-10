import { describe, expect, it } from 'vitest';
import { challengeFromRisk } from '@/demo/engine/challenge';
import type { RiskResult } from '@/demo/types';

function risk(over: Partial<RiskResult> = {}): RiskResult {
  return {
    score: 58,
    threshold: 70,
    verdict: 'challenge',
    checks: [
      { id: 'kyc', label: '核对对方实名认证', status: 'warn', detail: '对方尚未完成实名认证' },
      { id: 'history', label: '查看对方历史交易', status: 'pass', detail: '93 笔成功 · 0 次纠纷' },
      { id: 'amount', label: '判断金额是否异常', status: 'warn', detail: '是你平时单量的 4.2 倍' },
    ],
    ...over,
  };
}

describe('challengeFromRisk', () => {
  it('原因列出全部问题项，不只第一条', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.reason).toContain('核对对方实名认证');
    expect(c.reason).toContain('判断金额是否异常');
    expect(c.reason).not.toContain('查看对方历史交易');
  });

  it('所需材料是各问题项的并集且去重', () => {
    const c = challengeFromRisk('ch_1', 'tx_1', risk(), '2026-08-09T10:00:00Z');
    expect(c.required).toEqual(['对方实名证件', '账户授权书', '资金来源证明', '交易背景说明']);
    expect(new Set(c.required).size).toBe(c.required.length);
  });

  it('没有问题项时回落到评分说明', () => {
    const clean = risk({
      checks: [{ id: 'kyc', label: '核对对方实名认证', status: 'pass', detail: '已通过' }],
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
