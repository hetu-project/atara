import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { toNullablePayload } from '@/features/counterparties/api';
import type { CounterpartyInput } from '@/lib/schema';

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
