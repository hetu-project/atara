import type { Challenge, RiskResult } from '@/demo/types';

/** 每项检查对应要补充的材料。 */
const REQUIRED: Record<string, string[]> = {
  kyc: ['对方实名证件', '账户授权书'],
  history: ['近三个月交易流水', '纠纷处理说明'],
  sanctions: ['地址归属说明', '合规意见书'],
  amount: ['资金来源证明', '交易背景说明'],
  response: ['联系人确认函'],
  tenure: ['账户开立证明'],
};

/**
 * 由 AI 检查结果生成一条待办。
 *
 * 原因列出**全部**问题项，不是只取第一条：检查项数组顺序固定，只取第一条的话
 * kyc 排在最前，一旦它中招就永远是它，挡单列表里每行原因都长得一样。
 */
export function challengeFromRisk(
  id: string,
  txId: string,
  risk: RiskResult,
  openedAt: string,
): Challenge {
  const flaws = risk.checks.filter((c) => c.status !== 'pass');

  return {
    id,
    txId,
    reason: flaws.length
      ? flaws.map((c) => `${c.label}：${c.detail}`).join('；')
      : `安全评分 ${risk.score} 未达到及格线 ${risk.threshold}`,
    required: flaws.length
      ? [...new Set(flaws.flatMap((c) => REQUIRED[c.id] ?? []))]
      : ['补充交易背景说明'],
    state: 'open',
    openedAt,
  };
}
