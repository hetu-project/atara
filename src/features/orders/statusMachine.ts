import type { OrderStatus, Payee } from '@/lib/schema';

export interface OrderRoleContext {
  status: OrderStatus;
  /** 当前用户是收款方 */
  isPayee: boolean;
  /** 当前用户是付款方 */
  isPayer: boolean;
}

/**
 * 当前用户在这个订单上可以执行的状态变更。
 *
 * 这是 DB 里 check_status_transition trigger 的镜像。前端这份只负责
 * 灰掉按钮，真正的强制在数据库 —— 两处规则必须一致，改动时同步修改
 * supabase/migrations/0001_init.sql 里的 trigger。
 *
 * 为什么按角色区分：付款方说"我付了"、收款方说"我收到了"，各自只能声明
 * 自己能确认的事实。若允许买家单方面标完成，一笔没付款的订单就能被结掉。
 */
export function allowedTransitions({ status, isPayee, isPayer }: OrderRoleContext): OrderStatus[] {
  if (!isPayee && !isPayer) return [];

  if (status === 'pending_payment') {
    const next: OrderStatus[] = [];
    if (isPayer) next.push('paid');
    next.push('cancelled');
    return next;
  }

  if (status === 'paid') {
    return isPayee ? ['completed'] : [];
  }

  // completed / cancelled 是终态
  return [];
}

/**
 * 把订单和「我持有哪些档案」换算成角色上下文。
 *
 * payee 列指明这笔钱付给谁：payee='buyer' 就是买家收款、卖家付款。
 * 绝不能用 order_type 推断 —— crypto 默认买家收币只是表单默认值，用户可以改。
 */
export function roleContextFor(
  order: { status: OrderStatus; payee: Payee; buyer_id: string; seller_id: string },
  myProfileIds: Set<string>,
): OrderRoleContext {
  const iAmBuyer = myProfileIds.has(order.buyer_id);
  const iAmSeller = myProfileIds.has(order.seller_id);
  const payeeIsBuyer = order.payee === 'buyer';
  return {
    status: order.status,
    isPayee: payeeIsBuyer ? iAmBuyer : iAmSeller,
    isPayer: payeeIsBuyer ? iAmSeller : iAmBuyer,
  };
}
