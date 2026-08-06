import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  formatAmount,
  formatDate,
  formatDateTime,
  shortenAddress,
} from '@/lib/format';

describe('formatAmount', () => {
  it('字符串金额按千分位展示', () => {
    expect(formatAmount('1234567.5')).toBe('1,234,567.50');
  });
  it('可指定小数位', () => {
    expect(formatAmount('0.12345678', 8)).toBe('0.12345678');
  });
  it('空值返回短横线', () => {
    expect(formatAmount(null)).toBe('-');
    expect(formatAmount('')).toBe('-');
  });
});

describe('formatDateTime / formatDate', () => {
  it('格式化 ISO 时间', () => {
    expect(formatDateTime('2026-08-06T03:04:05Z')).toMatch(/^2026-08-06 \d{2}:\d{2}$/);
  });
  it('只取日期部分', () => {
    expect(formatDate('2026-08-06T03:04:05Z')).toBe('2026-08-06');
  });
  it('空值返回短横线', () => {
    expect(formatDateTime(null)).toBe('-');
  });
});

describe('shortenAddress', () => {
  it('长地址中间省略', () => {
    expect(shortenAddress('TXkabcdefghijklmnopqrstuvwxyz1234')).toBe('TXkabc...1234');
  });
  it('短地址原样返回', () => {
    expect(shortenAddress('TXk123')).toBe('TXk123');
  });
  it('空值返回短横线', () => {
    expect(shortenAddress(null)).toBe('-');
  });
});

describe('label 映射', () => {
  it('订单状态有全部四个中文 label', () => {
    expect(ORDER_STATUS_LABEL.pending_payment).toBe('待付款');
    expect(ORDER_STATUS_LABEL.paid).toBe('已付款');
    expect(ORDER_STATUS_LABEL.completed).toBe('已完成');
    expect(ORDER_STATUS_LABEL.cancelled).toBe('已取消');
  });
  it('订单类型 label', () => {
    expect(ORDER_TYPE_LABEL.crypto).toBe('Crypto');
    expect(ORDER_TYPE_LABEL.fiat).toBe('法币');
  });
});
