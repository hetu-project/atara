import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { resolveParties } from '../resolveParties';

const BUYER = { id: 'b1', display_id: 'U000001', full_name: '张三' };
const SELLER = { id: 's1', display_id: 'U000002', full_name: '李四' };

describe('resolveParties', () => {
  it('按 id 解析买卖双方，返回以 id 为键的 Map', async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [BUYER, SELLER], error: null });

    const result = await resolveParties(['b1', 's1']);

    expect(rpc).toHaveBeenCalledWith('lookup_counterparties_by_id', { p_ids: ['b1', 's1'] });
    expect(result.get('b1')).toEqual(BUYER);
    expect(result.get('s1')).toEqual(SELLER);
  });

  it('买卖是同一档案时去重，只查一次', async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [BUYER], error: null });

    const result = await resolveParties(['b1', 'b1']);

    expect(rpc).toHaveBeenCalledWith('lookup_counterparties_by_id', { p_ids: ['b1'] });
    expect(result.get('b1')).toEqual(BUYER);
  });

  it('空数组不发请求', async () => {
    rpc.mockReset();

    const result = await resolveParties([]);

    expect(rpc).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it('查不到的 id（档案已被删）不会出现在 Map 里', async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await resolveParties(['missing']);

    expect(result.has('missing')).toBe(false);
  });
});
