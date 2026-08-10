import { challengeFromRisk } from './engine/challenge';
import { assessRisk } from './engine/riskEngine';
import { seededRandom } from './random';
import type { Challenge, Counterparty, DemoState, PoolOrder, Transaction, TxStatus } from './types';

const NAMES = [
  'Meridian Capital',
  'Nakamoto Desk',
  'Silk Route OTC',
  'Helios Trading',
  'Orion Settlement',
  'Vega Liquidity',
  'Kestrel Markets',
  'Aurora FX',
  'Ironwood Partners',
  'Blue Harbor',
  'Cinder Desk',
  'Northwind OTC',
  'Solstice Capital',
  'Granite Flow',
  'Lumen Exchange',
  'Tessera Desk',
];

const ASSETS = [
  { asset: 'USDT', chain: 'TRON', px: 1 },
  { asset: 'USDT', chain: 'ETH', px: 1 },
  { asset: 'USDC', chain: 'POLYGON', px: 1 },
  { asset: 'BTC', chain: 'BTC', px: 94_200 },
  { asset: 'ETH', chain: 'ETH', px: 3_180 },
];

const FIATS = ['USD', 'EUR', 'HKD', 'CNY'];

function makeCounterparty(i: number): Counterparty {
  const r = seededRandom(`cp_${i}`);
  const completed = Math.floor(r() * 180) + 2;
  const disputes = r() < 0.75 ? 0 : Math.floor(r() * 4) + 1;
  const ageDays = Math.floor(r() * 700) + 8;
  return {
    displayId: `D${String(100000 + i * 37).slice(-6)}`,
    name: NAMES[i % NAMES.length],
    score: Math.min(99, 55 + Math.floor(r() * 45)),
    completedTrades: completed,
    disputes,
    avgResponseMin: Math.floor(r() * 90) + 2,
    verified: r() > 0.18,
    firstSeenAt: new Date(Date.now() - ageDays * 86400_000).toISOString(),
  };
}

export function makePoolOrder(i: number, now = Date.now()): PoolOrder {
  const r = seededRandom(`po_${i}`);
  const spec = ASSETS[Math.floor(r() * ASSETS.length)];
  const amount =
    spec.asset === 'BTC'
      ? Number((r() * 3 + 0.05).toFixed(3))
      : spec.asset === 'ETH'
        ? Number((r() * 40 + 0.5).toFixed(2))
        : Math.floor(r() * 180_000) + 2_000;
  const price = Number((spec.px * (0.985 + r() * 0.03)).toFixed(spec.px > 100 ? 0 : 4));
  return {
    id: `po_${i}`,
    side: r() > 0.42 ? 'sell' : 'buy',
    asset: spec.asset,
    chain: spec.chain,
    amount,
    fiatCurrency: FIATS[Math.floor(r() * FIATS.length)],
    price,
    fiatTotal: Number((amount * price).toFixed(2)),
    counterparty: makeCounterparty(i),
    postedAt: new Date(now - Math.floor(r() * 5_400_000)).toISOString(),
    expiresAt: new Date(now + Math.floor(r() * 7_200_000) + 600_000).toISOString(),
  };
}

/**
 * 预置一批历史交易。没有它的话，首次进入时队列和概览全是 0，页面看起来是死的
 * ——那正是我们要避免的空账号观感。
 *
 * 这些交易的状态直接取自各自 risk 的裁决，所以屏幕上不会出现「评分 91 却被拒绝」
 * 这种自相矛盾。它们都已是终态，不会触发队列页的自动推进。
 */
function seedTransactions(now: number): { transactions: Transaction[]; challenges: Challenge[] } {
  const transactions: Transaction[] = [];
  const challenges: Challenge[] = [];

  for (let i = 0; i < 9; i++) {
    const order = makePoolOrder(500 + i, now);
    const draft: Transaction = {
      id: `tx_seed_${i}`,
      poolOrderId: order.id,
      side: 'buy',
      asset: order.asset,
      amount: order.amount,
      fiatTotal: order.fiatTotal,
      fiatCurrency: order.fiatCurrency,
      counterparty: order.counterparty,
      status: 'validating',
      createdAt: new Date(now - (i + 1) * 2_400_000).toISOString(),
      risk: null,
      resubmits: 0,
    };

    const risk = assessRisk(draft);
    const status: TxStatus =
      risk.verdict === 'pass' ? 'passed' : risk.verdict === 'challenge' ? 'challenged' : 'declined';

    transactions.push({ ...draft, status, risk });

    if (status === 'challenged') {
      challenges.push(
        challengeFromRisk(
          `ch_seed_${i}`,
          draft.id,
          risk,
          new Date(now - (i + 1) * 2_300_000).toISOString(),
        ),
      );
    }
  }

  return { transactions, challenges };
}

export function createSeedState(): DemoState {
  const now = Date.now();
  const seeded = seedTransactions(now);

  return {
    desks: {
      buy: {
        kind: 'buy',
        displayId: 'D000001',
        name: '我的买入账户',
        verifiedAt: new Date(now - 86400_000 * 96).toISOString(),
        completedTrades: 34,
        disputes: 0,
        avgResponseMin: 4,
      },
      sell: {
        // 故意留成未开通：这是成交那条唯一规则的出场机会，也是「我的账户」页
        // 存在的理由。交易大厅上方的账户选择器切到卖出就能看到它生效。
        kind: 'sell',
        displayId: 'D000002',
        name: '我的卖出账户',
        verifiedAt: null,
        completedTrades: 0,
        disputes: 0,
        avgResponseMin: 0,
      },
    },
    pool: Array.from({ length: 40 }, (_, i) => makePoolOrder(i, now)),
    transactions: seeded.transactions,
    challenges: seeded.challenges,
  };
}
