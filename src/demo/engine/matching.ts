import type { Desk, DeskKind, PoolOrder } from '@/demo/types';

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

/**
 * 从大厅里挑一笔最优对手单。快捷兑换用它——用户只填金额，对手方由「AI」选。
 *
 * `want` 是**我**要做的方向：我要买，就得找别人在卖（side === 'sell'）。
 * 这不是把先前删掉的方向规则加回来——matchOrder 依然只管账户是否开通；
 * 这里是自动撮合的选单逻辑，两回事。
 *
 * 结算货币必须一并匹配：用户说「花 10000 USD」，却撮出一笔以 HKD 计价的挂单，
 * 屏幕上两个币种对不上，一眼就是错的。
 *
 * 「最优」= 对手方信用分最高。信用分相同则取金额更接近目标的那笔。
 */
export function pickBestMatch(
  pool: PoolOrder[],
  want: { asset: string; fiat: string; side: DeskKind; amount: number },
): PoolOrder | null {
  const needed: DeskKind = want.side === 'buy' ? 'sell' : 'buy';
  const candidates = pool.filter(
    (o) => o.asset === want.asset && o.fiatCurrency === want.fiat && o.side === needed,
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, o) => {
    if (o.counterparty.score !== best.counterparty.score) {
      return o.counterparty.score > best.counterparty.score ? o : best;
    }
    const d = Math.abs(o.amount - want.amount);
    return d < Math.abs(best.amount - want.amount) ? o : best;
  });
}
