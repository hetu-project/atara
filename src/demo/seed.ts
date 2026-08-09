import { seededRandom } from './random';
import type { Counterparty, DemoState, PoolOrder } from './types';

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

export function createSeedState(): DemoState {
  return {
    desks: {
      buy: {
        kind: 'buy',
        displayId: 'D000001',
        name: '我的买方席位',
        verifiedAt: new Date(Date.now() - 86400_000 * 96).toISOString(),
        completedTrades: 34,
        disputes: 0,
        avgResponseMin: 4,
      },
      sell: {
        // 故意留成未开通：这是撮合那条唯一规则的出场机会，也是「我的席位」页
        // 存在的理由。订单池上方的席位选择器切到卖方就能看到它生效。
        kind: 'sell',
        displayId: 'D000002',
        name: '我的卖方席位',
        verifiedAt: null,
        completedTrades: 0,
        disputes: 0,
        avgResponseMin: 0,
      },
    },
    pool: Array.from({ length: 40 }, (_, i) => makePoolOrder(i)),
    transactions: [],
    challenges: [],
  };
}
