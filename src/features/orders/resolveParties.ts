import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import type { Counterparty } from '@/lib/schema';

export type PartyRef = Pick<Counterparty, 'id' | 'display_id' | 'full_name'>;

/**
 * 批量解析订单买卖双方的姓名 / display_id，用于填回 OrderWithParties.buyer / seller。
 *
 * 不能靠 PostgREST 资源嵌入（`buyer:buyer_id (...)`）—— 嵌入查询会走被嵌表的 RLS，
 * counterparties 的 `own profiles` policy 只放行 `user_id = auth.uid()` 的行，
 * 对手方那一侧永远拿到 null。`lookup_counterparties_by_id` 是 security definer 函数，
 * 按 id 精确匹配返回同样的四个非敏感字段（与 lookup_counterparty 一致），
 * 绕开这个限制而不放宽任何东西 —— 不要改成给 counterparties 加 SELECT policy。
 *
 * 去重后再查：订单里买卖双方常常是同一批活跃用户反复出现，同一账号同时持有
 * 买卖双方档案时买家 id 和卖家 id 甚至可能相同，重复 id 没必要占用 IN 列表的位置。
 */
export async function resolveParties(ids: string[]): Promise<Map<string, PartyRef>> {
  const uniqueIds = Array.from(new Set(ids));
  const map = new Map<string, PartyRef>();
  if (uniqueIds.length === 0) return map;

  const { data, error } = await supabase.rpc('lookup_counterparties_by_id', { p_ids: uniqueIds });
  if (error) throw toFriendlyError(error);

  for (const row of (data as PartyRef[] | null) ?? []) {
    map.set(row.id, row);
  }
  return map;
}
