import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import type { Counterparty, CounterpartyInput, Role } from '@/lib/schema';

export interface ListParams {
  role: Role;
  keyword?: string;
  page: number;
  pageSize: number;
}

const SEARCH_FIELDS = ['full_name', 'display_id', 'email', 'phone'];

/**
 * PostgREST 的 or 过滤是拼字符串的，语法字符必须从用户输入里剔除，否则会生成畸形查询。
 * supabase-js 会把整个 or 串再包一层 `(...)`，所以输入里的 `)` 会提前闭合这个组；
 * `,` 是 or 的分隔符；`"` 和 `\` 是 PostgREST 的引用/转义字符。
 * 这类畸形查询报错在 toFriendlyError 里没有对应规则，会把后端原始报错直接抛给用户 ——
 * 正是本层要防的事，所以在源头剔除。
 */
export function sanitizeKeyword(raw: string | undefined): string {
  return (raw ?? '').replace(/[(),"\\]/g, '').trim();
}

/** 纯函数：把筛选参数转成 supabase 查询片段 */
export function buildCounterpartyQuery(params: ListParams): {
  from: number;
  to: number;
  orFilter?: string;
} {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const keyword = sanitizeKeyword(params.keyword);
  if (!keyword) return { from, to };

  return {
    from,
    to,
    orFilter: SEARCH_FIELDS.map((f) => `${f}.ilike.%${keyword}%`).join(','),
  };
}

export async function listCounterparties(params: ListParams) {
  const { from, to, orFilter } = buildCounterpartyQuery(params);

  let q = supabase
    .from('counterparties')
    .select('*', { count: 'exact' })
    .eq('role', params.role)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (orFilter) q = q.or(orFilter);

  const { data, error, count } = await q;
  if (error) throw toFriendlyError(error);

  return { rows: (data ?? []) as Counterparty[], total: count ?? 0 };
}

export async function getCounterparty(id: string): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').select('*').eq('id', id).single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

export async function createCounterparty(input: CounterpartyInput): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').insert(input).select('*').single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

export async function updateCounterparty(id: string, input: CounterpartyInput): Promise<Counterparty> {
  const { data, error } = await supabase
    .from('counterparties')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

/**
 * 下拉选择用。除了展示所需的 id / display_id / full_name，
 * 还带上默认收款信息 —— Task 10 的订单表单要用它自动带出收款字段。
 */
const OPTION_SELECT =
  'id, display_id, full_name, bank_name, bank_account_name, bank_account_number, bank_swift, default_wallet_address, default_wallet_chain';

export type CounterpartyOption = Pick<
  Counterparty,
  | 'id'
  | 'display_id'
  | 'full_name'
  | 'bank_name'
  | 'bank_account_name'
  | 'bank_account_number'
  | 'bank_swift'
  | 'default_wallet_address'
  | 'default_wallet_chain'
>;

export async function listCounterpartyOptions(role: Role): Promise<CounterpartyOption[]> {
  const { data, error } = await supabase
    .from('counterparties')
    .select(OPTION_SELECT)
    .eq('role', role)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as CounterpartyOption[];
}
