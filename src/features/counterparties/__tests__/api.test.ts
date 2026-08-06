import { describe, expect, it } from 'vitest';
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

  it('关键词里的逗号被剔除，避免破坏 or 语法', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: 'a,b', page: 1, pageSize: 20 }).orFilter).toContain(
      '%ab%',
    );
  });
});
