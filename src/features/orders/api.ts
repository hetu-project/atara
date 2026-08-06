import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { sanitizeKeyword } from '@/lib/sanitizeKeyword';
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

/**
 * 日期筛选框给的是**本地日历日**（<input type="date"> 的值，如 '2026-08-07'），
 * 而列表里的 created_at 也是用 formatDateTime 按本地时区渲染的。
 * 所以边界必须按本地时区的当天起止来算，不能直接拼 'T00:00:00.000Z'。
 *
 * 拼 Z 后缀会造成筛选结果和肉眼所见自相矛盾：东八区用户看到一张
 * 「08-07 03:00 创建」的订单，筛 08-07 却查不到它（它的 UTC 时刻是 08-06T19:00Z）。
 *
 * 不带时区后缀的 'YYYY-MM-DDTHH:mm:ss' 会被 JS 按本地时区解析，
 * toISOString() 再转成对应的 UTC 时刻 —— 这正是我们要的。
 */
function localDayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

function localDayEnd(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
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
    if (params.dateFrom) range.gte = localDayStart(params.dateFrom);
    if (params.dateTo) range.lte = localDayEnd(params.dateTo);
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
  // OrderInput 是 crypto | fiat 的判别联合，而 postgrest-js 的 insert<T>() 只能从
  // 联合里推断出一个分支，另一分支的字段就被判成"多余属性"而报错。
  // 收窄成普通对象类型即可 —— 这是诚实的描述（PostgREST 收的就是一个 JSON 对象），
  // 也比 `as never` 好：后者会把整个 payload 的类型检查都关掉。
  const payload: Record<string, unknown> = input;
  const { data, error } = await supabase.from('orders').insert(payload).select('*').single();
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
