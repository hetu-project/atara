import { describe, expect, it } from 'vitest';
import { sanitizeKeyword } from '@/lib/sanitizeKeyword';

describe('sanitizeKeyword', () => {
  it('undefined 与空串返回空串', () => {
    expect(sanitizeKeyword(undefined)).toBe('');
    expect(sanitizeKeyword('')).toBe('');
  });

  it('去掉首尾空格', () => {
    expect(sanitizeKeyword('  张三  ')).toBe('张三');
  });

  it('剥掉会破坏 PostgREST or 语法的字符', () => {
    expect(sanitizeKeyword('a(b)c,d"e\\f')).toBe('abcdef');
  });

  it('保留中文与常规字符', () => {
    expect(sanitizeKeyword('张三 U000123')).toBe('张三 U000123');
  });
});
