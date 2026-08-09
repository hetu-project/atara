import type { Desk, DeskKind } from '@/demo/types';

export type MatchResult = { ok: true } | { ok: false; reason: string };

const LABEL: Record<DeskKind, string> = { buy: '买方', sell: '卖方' };

/**
 * 能不能撮合。**只有一条规则：席位得先开通。**
 *
 * 方向互补、挂单过期、自成交这些一概不做——这是 Demo，池子里每一笔单都能撮合。
 * 保留这一条纯粹是为了给「我的席位」页一个存在的理由，并在撮合抽屉里引出一个
 * 「去开通席位」的跳转。
 */
export function matchOrder(myDesk: Desk): MatchResult {
  if (myDesk.verifiedAt === null) {
    return { ok: false, reason: `请先开通${LABEL[myDesk.kind]}席位` };
  }
  return { ok: true };
}
