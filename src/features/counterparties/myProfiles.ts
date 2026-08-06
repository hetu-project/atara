import type { Counterparty, Role } from '@/lib/schema';

export function pickProfile(
  rows: Counterparty[] | undefined,
  role: Role,
): Counterparty | undefined {
  return rows?.find((r) => r.role === role);
}

/**
 * 是否需要走引导流程。
 *
 * undefined 表示数据还没加载完 —— 此时必须返回 false。
 * 若把"还不知道"当成"没有档案"，用户每次刷新都会先闪一下 /onboarding。
 */
export function needsOnboarding(rows: Counterparty[] | undefined): boolean {
  return rows !== undefined && rows.length === 0;
}
