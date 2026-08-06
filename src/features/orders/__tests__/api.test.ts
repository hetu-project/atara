import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { buildOrderQuery } from '@/features/orders/api';

describe('buildOrderQuery', () => {
  it('计算分页 range', () => {
    expect(buildOrderQuery({ page: 2, pageSize: 20 })).toMatchObject({ from: 20, to: 39 });
  });

  it('无筛选时 filters 为空', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20 }).filters).toEqual([]);
  });

  it('按类型和状态筛选', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, orderType: 'crypto', status: 'paid' }).filters).toEqual([
      ['order_type', 'crypto'],
      ['status', 'paid'],
    ]);
  });

  it('订单号搜索走 ilike', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, keyword: 'ORD2026' }).orFilter).toBe(
      'order_no.ilike.%ORD2026%',
    );
  });

  it('空关键词不生成 orFilter', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, keyword: '   ' }).orFilter).toBeUndefined();
  });

  it('剔除会破坏 PostgREST or 语法的字符', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, keyword: 'ORD(2026),x' }).orFilter).toBe(
      'order_no.ilike.%ORD2026x%',
    );
  });

  it('日期区间转成 gte / lte', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01', dateTo: '2026-08-06' });
    expect(r.range).toEqual({ gte: '2026-08-01T00:00:00.000Z', lte: '2026-08-06T23:59:59.999Z' });
  });

  it('只填开始日期时只有 gte', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01' });
    expect(r.range).toEqual({ gte: '2026-08-01T00:00:00.000Z' });
  });

  it('无日期时 range 为 undefined', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20 }).range).toBeUndefined();
  });
});
