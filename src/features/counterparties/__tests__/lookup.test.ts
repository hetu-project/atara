import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { lookupCounterparty } from '../lookup';

const ROW = { id: 'u1', display_id: 'U000123', role: 'seller' as const, full_name: '张三' };

describe('lookupCounterparty', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [ROW], error: null });
  });

  it('把输入 trim + 转大写后再传给 RPC', async () => {
    await lookupCounterparty('  u000123 ', 'seller');
    expect(rpc).toHaveBeenCalledWith('lookup_counterparty', { p_display_id: 'U000123' });
  });

  it('空输入不发请求', async () => {
    await expect(lookupCounterparty('   ', 'seller')).rejects.toThrow('请输入对方的用户 ID');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('查不到时错误消息里用规范化后的 ID', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(lookupCounterparty(' u999 ', 'seller')).rejects.toThrow('未找到用户 ID U999');
  });

  it('角色不匹配时报错并说明实际角色', async () => {
    await expect(lookupCounterparty('U000123', 'buyer')).rejects.toThrow('是卖家，不是买家');
  });

  it('角色匹配时返回该行', async () => {
    await expect(lookupCounterparty('U000123', 'seller')).resolves.toEqual(ROW);
  });
});
