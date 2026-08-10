import { seededRandom } from '@/demo/random';
import type { CheckStatus, RiskCheck, RiskResult, Transaction } from '@/demo/types';

export const THRESHOLD = 70;

/**
 * 六个固定检查项。ok / bad 是文案模板，数字由种子填。
 * 数组顺序即屏幕上的显示顺序。
 *
 * bad 的第二个参数 hard 表示这一项是不是本次的致命项（红色 ✕）。文案必须跟着
 * 严重度走：把「命中制裁名单」配一个橙色「需留意」图标，是屏幕上最刺眼的自相
 * 矛盾——那种事只可能是致命的。
 */
const CHECKS = [
  {
    id: 'kyc',
    label: '核对对方实名认证',
    ok: () => '已通过 · 证件与地址一致',
    bad: (_n: number, hard: boolean) =>
      hard ? '实名信息与证件不符' : '对方尚未完成实名认证',
  },
  {
    id: 'history',
    label: '查看对方历史交易',
    ok: (n: number) => `${n} 笔成功 · 0 次纠纷`,
    bad: (n: number, hard: boolean) =>
      hard
        ? `${n} 笔成功，但有 ${3 + (n % 5)} 次未解决的纠纷`
        : `${n} 笔成功 · ${1 + (n % 4)} 次纠纷`,
  },
  {
    id: 'sanctions',
    label: '检查收款地址是否安全',
    ok: () => '未出现在任何风险名单',
    bad: (_n: number, hard: boolean) =>
      hard ? '命中国际制裁名单关联地址' : '该地址近期有异常资金往来',
  },
  {
    id: 'amount',
    label: '判断金额是否异常',
    ok: (n: number) => `与你平时的单量相当（${(0.8 + (n % 60) / 100).toFixed(1)} 倍）`,
    bad: (n: number, hard: boolean) =>
      hard
        ? `是你平时单量的 ${(8 + (n % 30)).toFixed(0)} 倍，明显异常`
        : `是你平时单量的 ${(2.5 + (n % 45) / 10).toFixed(1)} 倍`,
  },
  {
    id: 'response',
    label: '评估对方响应速度',
    ok: (n: number) => `平均 ${1 + (n % 9)} 分钟回复`,
    bad: (n: number, hard: boolean) =>
      hard ? '最近多次不回复' : `平均 ${45 + (n % 120)} 分钟才回复，偏慢`,
  },
  {
    id: 'tenure',
    label: '核实账户注册时长',
    ok: (n: number) => `已注册 ${180 + (n % 600)} 天`,
    bad: (n: number, hard: boolean) =>
      hard ? `刚注册 ${1 + (n % 3)} 天的新账户` : `仅注册 ${3 + (n % 25)} 天`,
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
    const isHard = hasFail && i === picked[0];
    const status: CheckStatus = isFlawed ? (isHard ? 'fail' : 'warn') : 'pass';
    return {
      id: c.id,
      label: c.label,
      status,
      detail: isFlawed ? c.bad(n, isHard) : c.ok(n),
    };
  });

  const verdict: RiskResult['verdict'] =
    score >= THRESHOLD ? 'pass' : score >= 50 ? 'challenge' : 'decline';

  return { score, threshold: THRESHOLD, verdict, checks };
}
