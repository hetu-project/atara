import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { sanitizeKeyword } from '@/features/counterparties/api';
import type {
  Order,
  OrderInput,
  OrderStatus,
  OrderStatusLog,
  OrderType,
  OrderWithParties,
} from '@/lib/schema';

export const ORDER_SELECT =
  '*, buyer:buyer_id (id, display_id, full_name), seller:seller_id (id, display_id, full_name)';

export interface OrderListParams {
  page: number;
  pageSize: number;
  orderType?: OrderType;
  status?: OrderStatus;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function buildOrderQuery(params: OrderListParams): {
  from: number;
  to: number;
  filters: Array<[string, string]>;
  orFilter?: string;
  range?: { gte?: string; lte?: string };
} {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const filters: Array<[string, string]> = [];
  if (params.orderType) filters.push(['order_type', params.orderType]);
  if (params.status) filters.push(['status', params.status]);

  const keyword = sanitizeKeyword(params.keyword);
  const orFilter = keyword ? `order_no.ilike.%${keyword}%` : undefined;

  let range: { gte?: string; lte?: string } | undefined;
  if (params.dateFrom || params.dateTo) {
    range = {};
    if (params.dateFrom) range.gte = `${params.dateFrom}T00:00:00.000Z`;
    if (params.dateTo) range.lte = `${params.dateTo}T23:59:59.999Z`;
  }

  return { from, to, filters, orFilter, range };
}

export async function listOrders(params: OrderListParams) {
  const { from, to, filters, orFilter, range } = buildOrderQuery(params);

  let q = supabase
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  for (const [col, val] of filters) q = q.eq(col, val);
  if (orFilter) q = q.or(orFilter);
  if (range?.gte) q = q.gte('created_at', range.gte);
  if (range?.lte) q = q.lte('created_at', range.lte);

  const { data, error, count } = await q;
  if (error) throw toFriendlyError(error);

  return { rows: (data ?? []) as unknown as OrderWithParties[], total: count ?? 0 };
}

export async function getOrder(id: string): Promise<OrderWithParties> {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).single();
  if (error) throw toFriendlyError(error);
  return data as unknown as OrderWithParties;
}

export async function createOrder(input: OrderInput): Promise<Order> {
  // `OrderInput` 是 crypto/fiat 判别联合类型；supabase-js 的 insert<Row>() 从联合类型实参推断
  // 泛型时只会取到联合的第一个分支，导致把另一分支整体判定为“多余属性”而报错（与业务逻辑无关，
  // 是该版本 supabase-js 对联合类型 insert 的已知类型推断限制）。用 `as never` 绕过这次类型检查，
  // 不改变运行时行为——真正的字段校验已经在上层 zod schema 完成。
  const { data, error } = await supabase.from('orders').insert(input as never).select('*').single();
  if (error) throw toFriendlyError(error);
  return data as Order;
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toFriendlyError(error);
  return data as Order;
}

export async function listOrderStatusLogs(orderId: string): Promise<OrderStatusLog[]> {
  const { data, error } = await supabase
    .from('order_status_logs')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw toFriendlyError(error);
  return (data ?? []) as OrderStatusLog[];
}
