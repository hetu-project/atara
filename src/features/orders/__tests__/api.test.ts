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

  // 断言写成"与本地时区无关"的形式：直接比对同样按本地时区解析出的 ISO 串，
  // 而不是硬编码某个 UTC 字面量 —— 否则这个测试只在 UTC 机器上通过。
  it('日期区间按本地时区的当天起止转成 gte / lte', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01', dateTo: '2026-08-06' });
    expect(r.range).toEqual({
      gte: new Date('2026-08-01T00:00:00').toISOString(),
      lte: new Date('2026-08-06T23:59:59.999').toISOString(),
    });
  });

  it('起点确实落在本地时区的当天零点', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01' });
    const start = new Date(r.range!.gte!);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(1);
  });

  it('只填开始日期时只有 gte', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01' });
    expect(Object.keys(r.range!)).toEqual(['gte']);
  });

  it('无日期时 range 为 undefined', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20 }).range).toBeUndefined();
  });
});
