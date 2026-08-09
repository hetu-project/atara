import { seededRandom } from '@/demo/random';
import type { CheckStatus, RiskCheck, RiskResult, Transaction } from '@/demo/types';

export const THRESHOLD = 70;

/**
 * 六个固定检查项。ok / bad 是文案模板，数字由种子填。
 * 数组顺序即屏幕上的显示顺序。
 */
const CHECKS = [
  {
    id: 'kyc',
    label: '核对席位实名状态',
    ok: () => '已验证 · 证件与地址一致',
    bad: () => '对手方未完成实名认证',
  },
  {
    id: 'history',
    label: '拉取对手方历史成交',
    ok: (n: number) => `${n} 笔完成 · 0 争议`,
    bad: (n: number) => `${n} 笔完成 · ${1 + (n % 4)} 争议`,
  },
  {
    id: 'sanctions',
    label: '链上地址制裁名单筛查',
    ok: () => '无命中（OFAC / UN / EU）',
    bad: () => '命中 OFAC SDN 关联地址',
  },
  {
    id: 'amount',
    label: '金额异常检测',
    ok: (n: number) => `与席位均值相当（${(0.8 + (n % 60) / 100).toFixed(1)}×）`,
    bad: (n: number) => `高于席位均值 ${(2.5 + (n % 45) / 10).toFixed(1)}×`,
  },
  {
    id: 'response',
    label: '对手方响应时效',
    ok: (n: number) => `中位 ${1 + (n % 9)} 分钟`,
    bad: (n: number) => `中位 ${45 + (n % 120)} 分钟，偏慢`,
  },
  {
    id: 'tenure',
    label: '账户存续时长',
    ok: (n: number) => `${180 + (n % 600)} 天`,
    bad: (n: number) => `仅 ${3 + (n % 25)} 天`,
  },
] as const;

/**
 * 一笔交易的风控评估。**不调用任何 AI 服务，不发任何网络请求。**
 *
 * 刻意写得很薄：先由种子定分数，再倒推出几条问题项——不是先算检查再加权。
 * 这个顺序保证屏幕上永远自洽（分数低就一定看得到问题），代码量只有加权模型的
 * 三分之一。这是 Demo，没人会核验这些规则是否合理，把它写「真」只会增加会出错
 * 的代码。
 *
 * 随机成分由 tx.id 做种子，所以同一笔单反复评估结果完全一致——重新渲染不会让
 * 分数跳变，那是最容易穿帮的地方。
 */
export function assessRisk(tx: Transaction): RiskResult {
  const rand = seededRandom(tx.id);

  // 1. 先定分数。补过材料的加分，让「补充后重新提交」这条路径有实际效果。
  const score = Math.min(100, 45 + Math.floor(rand() * 55) + tx.resubmits * 15);

  // 2. 分数决定有几项不合格，以及最差那项是 warn 还是 fail
  const flawCount = score >= 85 ? 0 : score >= THRESHOLD ? 1 : score >= 50 ? 2 : 3;
  const hasFail = score < 50;

  // 3. 按种子挑出哪几项是问题项
  const picked = CHECKS.map((_, i) => ({ i, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, flawCount)
    .map((x) => x.i);
  const flawed = new Set(picked);

  const checks: RiskCheck[] = CHECKS.map((c, i) => {
    const n = Math.floor(rand() * 200) + 3;
    const isFlawed = flawed.has(i);
    const status: CheckStatus = isFlawed
      ? hasFail && i === picked[0]
        ? 'fail'
        : 'warn'
      : 'pass';
    return {
      id: c.id,
      label: c.label,
      status,
      detail: isFlawed ? c.bad(n) : c.ok(n),
    };
  });

  const verdict: RiskResult['verdict'] =
    score >= THRESHOLD ? 'pass' : score >= 50 ? 'challenge' : 'decline';

  return { score, threshold: THRESHOLD, verdict, checks };
}
