import type { Desk, DeskKind } from '@/demo/types';

export type MatchResult = { ok: true } | { ok: false; reason: string };

const LABEL: Record<DeskKind, string> = { buy: '买入', sell: '卖出' };

/**
 * 能不能成交。**只有一条规则：账户得先开通。**
 *
 * 方向互补、挂单过期、自成交这些一概不做——这是 Demo，大厅里每一笔单都能成交。
 * 保留这一条纯粹是为了给「我的账户」页一个存在的理由，并在确认弹窗里引出一个
 * 「去开通账户」的跳转。
 */
export function matchOrder(myDesk: Desk): MatchResult {
  if (myDesk.verifiedAt === null) {
    return { ok: false, reason: `请先开通${LABEL[myDesk.kind]}账户` };
  }
  return { ok: true };
}
