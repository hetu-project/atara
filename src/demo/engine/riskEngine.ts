import { seededRandom } from '@/demo/random';
import type { CheckStatus, RiskCheck, RiskResult, Transaction } from '@/demo/types';

export const THRESHOLD = 70;

export const GROUPS = ['身份核验', '链上分析', '行为与信用', '合规名单'] as const;

/**
 * 八个检查项，分四组，每组挂一个「模型」。
 *
 * 分组和模型名是为了让画面读起来像多模型并行推理，而不是一张写死的规则清单——
 * 后者一眼就能看出是 if/else。ok / bad 是文案模板，数字由种子填；bad 的第二个
 * 参数 hard 表示这一项是不是本次的致命项（红色 ✕），文案必须跟着严重度走：把
 * 「命中制裁名单」配一个橙色「需留意」图标，是屏幕上最刺眼的自相矛盾。
 */
const CHECKS = [
  {
    id: 'kyc',
    group: '身份核验',
    label: '身份一致性比对',
    model: 'atara-kyc-v4',
    ok: () => '证件、活体与登记地址三方一致',
    bad: (_n: number, hard: boolean) =>
      hard ? '活体检测与证件照不匹配' : '登记地址与证件签发地不一致',
  },
  {
    id: 'kyb',
    group: '身份核验',
    label: '企业主体与受益人穿透',
    model: 'atara-kyb-v2',
    ok: (n: number) => `主体存续正常 · 已穿透 ${2 + (n % 3)} 层受益人`,
    bad: (n: number, hard: boolean) =>
      hard ? '实际控制人指向高风险司法辖区' : `第 ${2 + (n % 3)} 层受益人信息缺失`,
  },
  {
    id: 'kyt',
    group: '链上分析',
    label: '资金溯源追踪',
    model: 'kyt-trace-3.1',
    ok: (n: number) => `回溯 ${4 + (n % 4)} 跳 · 资金来源清晰`,
    bad: (n: number, hard: boolean) =>
      hard ? `${1 + (n % 2)} 跳内接触过混币服务` : `${3 + (n % 3)} 跳外有一笔来源不明的入金`,
  },
  {
    id: 'graph',
    group: '链上分析',
    label: '地址聚类与关联图谱',
    model: 'graph-cluster-2.4',
    ok: (n: number) => `聚类 ${18 + (n % 60)} 个地址 · 无异常关联`,
    bad: (n: number, hard: boolean) =>
      hard ? '与已标记的欺诈团伙地址同簇' : `同簇内有 ${1 + (n % 3)} 个地址被举报过`,
  },
  {
    id: 'behavior',
    group: '行为与信用',
    label: '交易行为序列建模',
    model: 'seq-anomaly-v5',
    ok: (n: number) => `与同类账户基线偏离 ${(0.2 + (n % 40) / 100).toFixed(2)}σ`,
    bad: (n: number, hard: boolean) =>
      hard
        ? `行为突变，偏离基线 ${(4 + (n % 30) / 10).toFixed(1)}σ`
        : `近期节奏加快，偏离基线 ${(1.6 + (n % 12) / 10).toFixed(1)}σ`,
  },
  {
    id: 'credit',
    group: '行为与信用',
    label: '对手方信用评估',
    model: 'counterparty-credit-v3',
    ok: (n: number) => `${n} 笔履约 · 0 次纠纷`,
    bad: (n: number, hard: boolean) =>
      hard ? `${n} 笔履约，但有 ${3 + (n % 5)} 次纠纷未了结` : `${n} 笔履约 · ${1 + (n % 4)} 次纠纷`,
  },
  {
    id: 'amount',
    group: '行为与信用',
    label: '金额分位与异常检测',
    model: 'seq-anomaly-v5',
    ok: (n: number) => `处于你历史单量的 P${45 + (n % 30)} 分位`,
    bad: (n: number, hard: boolean) =>
      hard
        ? `是你平时单量的 ${8 + (n % 30)} 倍，明显异常`
        : `是你平时单量的 ${(2.5 + (n % 45) / 10).toFixed(1)} 倍`,
  },
  {
    id: 'sanctions',
    group: '合规名单',
    label: '制裁 / PEP / 不利媒体筛查',
    model: 'watchlist-match-1.8',
    ok: (n: number) => `比对 ${9 + (n % 6)} 个名单库 · 无命中`,
    bad: (_n: number, hard: boolean) =>
      hard ? '命中国际制裁名单关联地址' : '匹配到一条待核实的不利媒体报道',
  },
] as const;

/**
 * 一笔交易的风控评估。**不调用任何 AI 服务，不发任何网络请求。**
 *
 * 刻意写得很薄：先由种子定分数，再倒推出几条问题项——不是先算检查再加权。
 * 这个顺序保证屏幕上永远自洽（分数低就一定看得到问题），代码量只有真加权模型
 * 的一小部分。这是 Demo，没人会核验这些规则是否合理，把它写「真」只会增加会
 * 出错的代码。
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
      group: c.group,
      label: c.label,
      model: c.model,
      latencyMs: 120 + Math.floor(rand() * 680),
      status,
      detail: isFlawed ? c.bad(n, isHard) : c.ok(n),
    };
  });

  const verdict: RiskResult['verdict'] =
    score >= THRESHOLD ? 'pass' : score >= 50 ? 'challenge' : 'decline';

  // 置信度：分数越靠近阈值、问题项越多，模型越「不确定」。纯粹为了让画面上
  // 多一个像模型输出的数字，不参与任何判定。
  const distance = Math.abs(score - THRESHOLD);
  const confidence = Math.max(
    62,
    Math.min(99, Math.round(78 + distance * 0.6 - flawCount * 4 + rand() * 6)),
  );

  return {
    score,
    threshold: THRESHOLD,
    verdict,
    checks,
    confidence,
    featureCount: 180 + Math.floor(rand() * 260),
    summary: summarize(tx, checks, score, verdict, confidence),
  };
}

/**
 * 一段自然语言结论，由实际检查结果拼出来。
 *
 * 这是整个 Demo 里最像「大模型在说话」的一处，所以绝不能写死——同一段话反复
 * 出现是「这是假的」最明显的信号。
 */
function summarize(
  tx: Transaction,
  checks: RiskCheck[],
  score: number,
  verdict: RiskResult['verdict'],
  confidence: number,
): string {
  const flaws = checks.filter((c) => c.status !== 'pass');
  const fail = checks.find((c) => c.status === 'fail');
  const name = tx.counterparty.name;
  const modelCount = new Set(checks.map((c) => c.model)).size;
  const groups = [...new Set(checks.map((c) => c.group))].join('、');

  const head = `已并行调用 ${modelCount} 个模型，覆盖${groups}共 ${checks.length} 项判定。`;

  if (fail) {
    // 其余问题项也要点名：屏幕上挂着三条橙色警告，结论却只讲一条，一看就是模板。
    const others = flaws.filter((c) => c.id !== fail.id);
    const extra = others.length
      ? `另有 ${others.length} 项需要留意：${others.map((c) => c.label).join('、')}。`
      : '';
    return (
      `${head}${fail.label}命中硬性风险：${fail.detail}。${extra}该信号不可由其他维度的` +
      `良好表现抵消，模型直接给出否决结论。综合评分 ${score}，置信度 ${confidence}%。` +
      `建议放弃与 ${name} 的这笔交易。`
    );
  }

  if (flaws.length === 0) {
    return (
      `${head}${name} 在全部维度均未触发风险信号：链上资金来源清晰，历史履约与行为节奏` +
      `都处于同类账户的正常区间。综合评分 ${score}，置信度 ${confidence}%，可以正常推进。`
    );
  }

  const list = flaws.map((c) => `${c.label}（${c.detail}）`).join('；');
  const tone =
    verdict === 'pass'
      ? '其余维度表现稳健，加权后仍高于放行线，风险可控。'
      : '多项信号叠加后已低于放行线，需要补充材料重新评估。';

  return `${head}${name} 有 ${flaws.length} 项需要留意：${list}。${tone}综合评分 ${score}，置信度 ${confidence}%。`;
}
