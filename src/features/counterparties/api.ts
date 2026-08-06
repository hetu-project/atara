import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import type { Counterparty, CounterpartyInput } from '@/lib/schema';

export async function getCounterparty(id: string): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').select('*').eq('id', id).single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

/**
 * 当前用户的全部档案（0-2 条：最多一个买家 + 一个卖家）。
 *
 * 不需要 .eq('user_id', ...) —— RLS 的 own profiles policy 已保证
 * 只返回 user_id = auth.uid() 的行。在这里重复过滤会造成
 * "安全依赖前端条件"的错觉，实际的保证在数据库里。
 */
export async function getMyProfiles(): Promise<Counterparty[]> {
  const { data, error } = await supabase
    .from('counterparties')
    .select('*')
    .order('role', { ascending: true });
  if (error) throw toFriendlyError(error);
  return (data ?? []) as Counterparty[];
}

/**
 * zod 的选填字段用 blankToUndefined 把空字符串归一成 undefined（见 schema.ts），
 * 这样 zod 输出对象上这个 key 的值是 undefined —— 但 JSON.stringify 序列化时会把
 * 值为 undefined 的 key 整个丢掉，等价于请求体里完全没提这一列。
 * PostgREST 的语义是"没提到的列不改"，所以 PATCH 请求会静默地保留旧值，
 * 而不是操作者在表单里清空后期望的"改成空"。
 *
 * 这里显式把 undefined 转成 null，让请求体如实带上"清空该列"的指令。
 * 对 insert 同样适用且无害：role / full_name 是必填项，tags 经 zod .default([])
 * 永远是数组，不会落到这个转换里。
 */
export function toNullablePayload(input: CounterpartyInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === undefined ? null : v]));
}

export async function createCounterparty(input: CounterpartyInput): Promise<Counterparty> {
  const { data, error } = await supabase
    .from('counterparties')
    .insert(toNullablePayload(input))
    .select('*')
    .single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

export async function updateCounterparty(id: string, input: CounterpartyInput): Promise<Counterparty> {
  const { data, error } = await supabase
    .from('counterparties')
    .update(toNullablePayload(input))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}
