import { describe, expect, it } from 'vitest';
import { needsOnboarding, pickProfile } from '../myProfiles';
import type { Counterparty } from '@/lib/schema';

function cp(role: 'buyer' | 'seller', displayId: string): Counterparty {
  return { id: `id-${displayId}`, display_id: displayId, role, full_name: '张三' } as Counterparty;
}

describe('pickProfile', () => {
  it('按角色取出档案', () => {
    const rows = [cp('buyer', 'U000001'), cp('seller', 'U000002')];
    expect(pickProfile(rows, 'buyer')?.display_id).toBe('U000001');
    expect(pickProfile(rows, 'seller')?.display_id).toBe('U000002');
  });

  it('该角色无档案时返回 undefined', () => {
    expect(pickProfile([cp('buyer', 'U000001')], 'seller')).toBeUndefined();
  });

  it('undefined 输入返回 undefined，不抛错', () => {
    expect(pickProfile(undefined, 'buyer')).toBeUndefined();
  });
});

describe('needsOnboarding', () => {
  it('数据未加载时不判定需要引导', () => {
    // undefined 表示"还不知道"，不能据此重定向 —— 否则加载期间会闪一下 /onboarding
    expect(needsOnboarding(undefined)).toBe(false);
  });

  it('空数组表示确实没有任何档案', () => {
    expect(needsOnboarding([])).toBe(true);
  });

  it('有任一档案即不需要引导', () => {
    expect(needsOnboarding([cp('seller', 'U000002')])).toBe(false);
  });
});
