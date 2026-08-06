import { describe, expect, it } from 'vitest';
import { counterpartySchema, orderSchema } from '@/lib/schema';

const buyerId = '11111111-1111-4111-8111-111111111111';
const sellerId = '22222222-2222-4222-8222-222222222222';

describe('counterpartySchema', () => {
  it('姓名为空时报错', () => {
    const r = counterpartySchema.safeParse({ role: 'buyer', full_name: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请填写姓名');
  });

  it('只填姓名和角色即可通过', () => {
    const r = counterpartySchema.safeParse({ role: 'seller', full_name: '张三' });
    expect(r.success).toBe(true);
  });

  it('空字符串的选填字段归一为 undefined', () => {
    const r = counterpartySchema.parse({ role: 'buyer', full_name: '张三', email: '', phone: '' });
    expect(r.email).toBeUndefined();
    expect(r.phone).toBeUndefined();
  });

  it('邮箱格式非法时报错', () => {
    const r = counterpartySchema.safeParse({ role: 'buyer', full_name: '张三', email: 'not-an-email' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('邮箱格式不正确');
  });

  it('出生日期晚于今天时报错', () => {
    const r = counterpartySchema.safeParse({ role: 'buyer', full_name: '张三', date_of_birth: '2999-01-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('出生日期不能晚于今天');
  });

  it('tags 缺省为空数组', () => {
    expect(counterpartySchema.parse({ role: 'buyer', full_name: '张三' }).tags).toEqual([]);
  });
});

describe('orderSchema - crypto', () => {
  const base = {
    order_type: 'crypto' as const,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: 100,
    payee: 'buyer' as const,
    asset: 'USDT' as const,
    chain: 'TRON' as const,
    receiving_address: 'TXk...abc',
  };

  it('完整的 crypto 订单通过', () => {
    expect(orderSchema.safeParse(base).success).toBe(true);
  });

  it('缺收款地址时报错', () => {
    const r = orderSchema.safeParse({ ...base, receiving_address: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请填写收款地址');
  });

  it('金额为 0 时报错', () => {
    const r = orderSchema.safeParse({ ...base, amount: 0 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('金额必须大于 0');
  });

  it('金额字符串会被转成数字', () => {
    const r = orderSchema.parse({ ...base, amount: '250.5' });
    expect(r.amount).toBe(250.5);
  });

  it('非数字金额给出中文报错而非 zod 默认英文', () => {
    const r = orderSchema.safeParse({ ...base, amount: 'abc' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请输入有效金额');
  });

  it('恰好 8 位小数可以通过', () => {
    expect(orderSchema.safeParse({ ...base, amount: 0.12345678 }).success).toBe(true);
  });

  it('超过 8 位小数、四舍五入后仍非零时报错要求最多 8 位小数', () => {
    const r = orderSchema.safeParse({ ...base, amount: 0.123456789 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('最多 8 位小数');
  });

  it('超过 8 位小数、四舍五入后变成 0 时报错金额过小', () => {
    const r = orderSchema.safeParse({ ...base, amount: 0.000000001 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('金额过小');
  });

  it('买卖家为同一人时报错', () => {
    const r = orderSchema.safeParse({ ...base, seller_id: buyerId });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('买家和卖家不能是同一人');
    expect(r.error?.issues[0].path).toEqual(['seller_id']);
  });
});

describe('orderSchema - fiat', () => {
  const base = {
    order_type: 'fiat' as const,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: 8000,
    payee: 'seller' as const,
    fiat_currency: 'USD' as const,
    bank_account_number: '6222 0000 1111 2222',
  };

  it('完整的法币订单通过', () => {
    expect(orderSchema.safeParse(base).success).toBe(true);
  });

  it('缺收款账号时报错', () => {
    const r = orderSchema.safeParse({ ...base, bank_account_number: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请填写收款账号');
  });

  it('法币订单不接受 crypto 字段的必填校验', () => {
    // 只要不带 asset/chain 也能过，说明分支判定正确
    expect(orderSchema.safeParse({ ...base }).success).toBe(true);
  });
});
