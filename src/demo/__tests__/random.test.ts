import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/demo/random';

describe('seededRandom', () => {
  it('同一个 seed 产出同一串数', () => {
    const a = seededRandom('tx_001');
    const b = seededRandom('tx_001');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('不同 seed 产出不同的数', () => {
    expect(seededRandom('tx_001')()).not.toBe(seededRandom('tx_002')());
  });

  it('结果落在 [0, 1)', () => {
    const r = seededRandom('spread');
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
