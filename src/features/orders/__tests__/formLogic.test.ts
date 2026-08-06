import { describe, expect, it } from 'vitest';
import { clearTypeFields, defaultPayee, payeeDefaults } from '@/features/orders/formLogic';

describe('defaultPayee', () => {
  it('crypto 订单默认收款方是买家', () => {
    expect(defaultPayee('crypto')).toBe('buyer');
  });
  it('法币订单默认收款方是卖家', () => {
    expect(defaultPayee('fiat')).toBe('seller');
  });
});

describe('clearTypeFields', () => {
  const values = {
    buyer_id: 'b',
    seller_id: 's',
    amount: 100,
    payee: 'buyer',
    asset: 'USDT',
    chain: 'TRON',
    receiving_address: 'TXk',
    fiat_currency: 'USD',
    bank_name: 'ICBC',
    bank_account_name: '张三',
    bank_account_number: '6222',
    bank_swift: 'ICBKCNBJ',
    note: 'n',
  };

  it('切到 crypto 时清空法币字段并保留通用字段', () => {
    const r = clearTypeFields(values, 'crypto');
    expect(r.fiat_currency).toBe('');
    expect(r.bank_name).toBe('');
    expect(r.bank_account_number).toBe('');
    expect(r.bank_swift).toBe('');
    expect(r.buyer_id).toBe('b');
    expect(r.amount).toBe(100);
    expect(r.note).toBe('n');
  });

  it('切到 crypto 时重置 payee 为买家', () => {
    expect(clearTypeFields({ ...values, payee: 'seller' }, 'crypto').payee).toBe('buyer');
  });

  it('切到 fiat 时清空 crypto 字段', () => {
    const r = clearTypeFields(values, 'fiat');
    expect(r.asset).toBe('');
    expect(r.chain).toBe('');
    expect(r.receiving_address).toBe('');
    expect(r.payee).toBe('seller');
  });

  it('order_type 被设为目标类型', () => {
    expect(clearTypeFields(values, 'fiat').order_type).toBe('fiat');
  });
});

describe('payeeDefaults', () => {
  const party = {
    bank_name: 'ICBC',
    bank_account_name: '张三',
    bank_account_number: '6222000011112222',
    bank_swift: 'ICBKCNBJ',
    default_wallet_address: 'TXkabc',
    default_wallet_chain: 'TRON' as const,
  };

  it('crypto 订单带出钱包地址和链', () => {
    expect(payeeDefaults('crypto', party)).toEqual({
      receiving_address: 'TXkabc',
      chain: 'TRON',
    });
  });

  it('法币订单带出银行信息', () => {
    expect(payeeDefaults('fiat', party)).toEqual({
      bank_name: 'ICBC',
      bank_account_name: '张三',
      bank_account_number: '6222000011112222',
      bank_swift: 'ICBKCNBJ',
    });
  });

  it('对方没有默认值时返回空字符串', () => {
    expect(payeeDefaults('crypto', undefined)).toEqual({ receiving_address: '', chain: '' });
    expect(payeeDefaults('fiat', {})).toEqual({
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
      bank_swift: '',
    });
  });
});
