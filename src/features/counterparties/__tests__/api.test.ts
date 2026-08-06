import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { buildCounterpartyQuery, toNullablePayload } from '@/features/counterparties/api';
import type { CounterpartyInput } from '@/lib/schema';

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

describe('toNullablePayload', () => {
  // 回归测试针对的是序列化层的 bug，不是对象层的：
  // zod 把清空的选填字段变成 undefined，`{ ...obj }` 之后这个 key 依然是 undefined，
  // 对象层的 toMatchObject / toEqual 断言看不出问题 —— 只有序列化成 JSON 字符串后，
  // JSON.stringify 才会把值为 undefined 的 key 整个丢掉，PATCH 请求体里就完全不提这一列。
  // 所以这里必须断言 JSON.stringify 的输出，而不是断言返回的对象本身。
  it('undefined 字段被序列化为 null，而不是被 JSON.stringify 静默丢弃', () => {
    const input = {
      role: 'buyer',
      full_name: '张三',
      tags: [],
      bank_account_number: undefined,
      bank_account_name: undefined,
      bank_swift: undefined,
      default_wallet_address: undefined,
    } as unknown as CounterpartyInput;

    const json = JSON.stringify(toNullablePayload(input));

    expect(json).toContain('"bank_account_number":null');
    expect(json).toContain('"bank_account_name":null');
    expect(json).toContain('"bank_swift":null');
    expect(json).toContain('"default_wallet_address":null');
  });

  it('已有值的字段原样保留', () => {
    const input = {
      role: 'seller',
      full_name: '李四',
      tags: ['vip'],
      email: 'a@b.com',
    } as unknown as CounterpartyInput;

    const json = JSON.stringify(toNullablePayload(input));
    expect(json).toContain('"full_name":"李四"');
    expect(json).toContain('"email":"a@b.com"');
    expect(json).toContain('"tags":["vip"]');
  });
});
