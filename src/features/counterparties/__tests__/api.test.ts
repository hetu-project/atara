import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { buildCounterpartyQuery } from '@/features/counterparties/api';

describe('buildCounterpartyQuery', () => {
  it('计算分页 range', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', page: 1, pageSize: 20 })).toMatchObject({
      from: 0,
      to: 19,
    });
    expect(buildCounterpartyQuery({ role: 'buyer', page: 3, pageSize: 20 })).toMatchObject({
      from: 40,
      to: 59,
    });
  });

  it('无关键词时不生成 or 过滤', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', page: 1, pageSize: 20 }).orFilter).toBeUndefined();
  });

  it('有关键词时对四个字段做模糊匹配', () => {
    expect(buildCounterpartyQuery({ role: 'seller', keyword: '张三', page: 1, pageSize: 20 }).orFilter).toBe(
      'full_name.ilike.%张三%,display_id.ilike.%张三%,email.ilike.%张三%,phone.ilike.%张三%',
    );
  });

  it('关键词首尾空格被裁剪，纯空格视为无关键词', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: '  ', page: 1, pageSize: 20 }).orFilter).toBeUndefined();
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: ' ab ', page: 1, pageSize: 20 }).orFilter).toContain(
      '%ab%',
    );
  });

  it('剔除会破坏 PostgREST or 语法的字符', () => {
    // 逗号是 or 的分隔符
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: 'a,b', page: 1, pageSize: 20 }).orFilter).toContain(
      '%ab%',
    );
    // 右括号会提前闭合 supabase-js 包在外层的那对括号
    expect(
      buildCounterpartyQuery({ role: 'buyer', keyword: 'ABC (HK) Ltd', page: 1, pageSize: 20 }).orFilter,
    ).toContain('%ABC HK Ltd%');
    // 双引号与反斜杠是 PostgREST 的引用/转义字符
    expect(
      buildCounterpartyQuery({ role: 'buyer', keyword: 'a"b\\c', page: 1, pageSize: 20 }).orFilter,
    ).toContain('%abc%');
  });
});
