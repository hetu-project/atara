/**
 * 由字符串种子产生的确定性伪随机序列（FNV-1a 哈希 + mulberry32）。
 *
 * 为什么不用 Math.random()：风控评分要在同一笔交易上稳定。用 Math.random()
 * 的话，每次重新渲染分数都会跳变，反复打开同一笔单会看到不同结论——这在演示
 * 里会立刻暴露它是假的。
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
