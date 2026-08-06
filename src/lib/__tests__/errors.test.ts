import { describe, expect, it } from 'vitest';
import { toFriendlyError } from '@/lib/errors';

describe('toFriendlyError', () => {
  it('唯一约束冲突给出重试提示', () => {
    expect(toFriendlyError({ code: '23505', message: 'duplicate key' }).message).toBe(
      '数据重复，请重试',
    );
  });

  it('CHECK 约束冲突提示字段有误', () => {
    expect(toFriendlyError({ code: '23514', message: 'violates check constraint' }).message).toBe(
      '填写的内容不符合规则，请检查后重试',
    );
  });

  it('外键约束冲突提示被引用', () => {
    expect(toFriendlyError({ code: '23503', message: 'fk' }).message).toBe(
      '该记录已被订单引用，无法删除',
    );
  });

  it('登录凭证错误', () => {
    expect(toFriendlyError({ message: 'Invalid login credentials' }).message).toBe('邮箱或密码不正确');
  });

  it('未知错误保留原始 message', () => {
    expect(toFriendlyError({ message: 'boom' }).message).toBe('boom');
  });

  it('完全无法识别时给兜底文案', () => {
    expect(toFriendlyError(null).message).toBe('操作失败，请稍后重试');
  });
});
