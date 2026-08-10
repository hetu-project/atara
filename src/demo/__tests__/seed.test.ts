import { describe, expect, it } from 'vitest';
import { pickBestMatch } from '@/demo/engine/matching';
import { FIATS, TRADABLE } from '@/demo/prices';
import { createSeedState } from '@/demo/seed';

describe('种子挂单池', () => {
  it('覆盖快捷兑换能选出的每一种组合', () => {
    // 少一种组合，用户选中它就撞空态。默认的 BTC/USD 尤其不能空。
    const { pool } = createSeedState();
    for (const asset of TRADABLE) {
      for (const fiat of FIATS) {
        for (const side of ['buy', 'sell'] as const) {
          const hit = pickBestMatch(pool, { asset, fiat, side, amount: 1 });
          expect(hit, `${side} ${asset} / ${fiat} 没有可撮合的挂单`).not.toBeNull();
        }
      }
    }
  });

  it('挂单 id 不重复', () => {
    const { pool } = createSeedState();
    expect(new Set(pool.map((o) => o.id)).size).toBe(pool.length);
  });
});
