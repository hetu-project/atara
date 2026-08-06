import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { ROLE_LABEL } from '@/lib/format';
import type { Role } from '@/lib/schema';

export interface CounterpartyRef {
  id: string;
  display_id: string;
  role: Role;
  full_name: string;
}

/**
 * 按用户 ID 精确查询对手方。
 *
 * 走 lookup_counterparty RPC 而非直接查表：RLS 只让用户看到自己的档案，
 * 而这个 security definer 函数只返回 id / display_id / role / full_name，
 * 身份证号和银行账号在数据库层面就取不到。
 *
 * 角色校验放在这里（而非 SQL 里）是有意的：RPC 保持"按 ID 查人"这一个职责，
 * 调用方各自决定要什么角色。返回的四个字段都不敏感，多返回一个角色不匹配的
 * 结果不构成泄漏。
 */
export async function lookupCounterparty(displayId: string, role: Role): Promise<CounterpartyRef> {
  // 规范化后再查：display_id 在库里一律是 U000123 形式的大写，
  // 用户手抄时常带空格或用小写。不在这里统一，u000123 会查不到人。
  const normalized = displayId.trim().toUpperCase();
  if (!normalized) throw new Error('请输入对方的用户 ID');

  const { data, error } = await supabase.rpc('lookup_counterparty', {
    p_display_id: normalized,
  });
  if (error) throw toFriendlyError(error);

  const row = (data as CounterpartyRef[] | null)?.[0];
  if (!row) throw new Error(`未找到用户 ID ${normalized}`);
  if (row.role !== role) {
    throw new Error(`${row.display_id} 是${ROLE_LABEL[row.role]}，不是${ROLE_LABEL[role]}`);
  }
  return row;
}
