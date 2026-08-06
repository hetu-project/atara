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

describe('toFriendlyError —— 自助注册相关', () => {
  it('角色档案重复给出具体原因，而非通用的数据重复', () => {
    const err = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "counterparties_user_id_role_key"',
    };
    expect(toFriendlyError(err).message).toBe('你已创建过该角色的档案');
  });

  it('其他 23505 冲突仍走通用文案', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "orders_order_no_key"' };
    expect(toFriendlyError(err).message).toBe('数据重复，请重试');
  });

  it('RLS 拒绝给出无权访问', () => {
    expect(toFriendlyError({ code: '42501', message: 'permission denied' }).message).toBe('无权访问该数据');
  });

  it('邮箱已注册', () => {
    expect(toFriendlyError({ message: 'User already registered' }).message).toBe('该邮箱已注册，请直接登录');
  });

  it('未验证邮箱的提示指向邮件，不再指向管理员', () => {
    expect(toFriendlyError({ message: 'Email not confirmed' }).message).toBe('邮箱尚未验证，请查收验证邮件');
  });

  it('状态机 trigger 的中文消息原样透出', () => {
    expect(toFriendlyError({ code: 'P0001', message: '只有收款方可以确认完成' }).message).toBe(
      '只有收款方可以确认完成',
    );
  });
});
