import type { OrderType, Payee } from '@/lib/schema';

const CRYPTO_FIELDS = ['asset', 'chain', 'receiving_address'] as const;
const FIAT_FIELDS = ['fiat_currency', 'bank_name', 'bank_account_name', 'bank_account_number', 'bank_swift'] as const;

/** crypto 订单默认买家收币；法币订单默认卖家收款 */
export function defaultPayee(orderType: OrderType): Payee {
  return orderType === 'crypto' ? 'buyer' : 'seller';
}

/** 切换订单类型时，清空另一类型的字段并重置收款方 */
export function clearTypeFields<T extends Record<string, unknown>>(
  values: T,
  nextType: OrderType,
): T & Record<string, unknown> {
  const next: Record<string, unknown> = { ...values, order_type: nextType, payee: defaultPayee(nextType) };
  const toClear = nextType === 'crypto' ? FIAT_FIELDS : CRYPTO_FIELDS;
  for (const f of toClear) next[f] = '';
  return next as T & Record<string, unknown>;
}
