import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/format';
import type { Counterparty, Role } from '@/lib/schema';
import { lookupCounterparty, type CounterpartyRef } from './lookup';

export default function CounterpartyPicker({
  role,
  label,
  value,
  onChange,
  error,
  myProfile,
}: {
  role: Role;
  label: string;
  /** 已选中的档案 uuid，空串表示未选 */
  value: string;
  onChange: (id: string) => void;
  error?: string;
  /** 当前用户同角色的档案，用于"这一方是我自己"的快捷填入 */
  myProfile?: Counterparty;
}) {
  const [keyword, setKeyword] = useState('');
  const [found, setFound] = useState<CounterpartyRef | undefined>();
  const [lookupError, setLookupError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleLookup() {
    setLookupError('');
    setPending(true);
    try {
      const row = await lookupCounterparty(keyword.trim(), role);
      setFound(row);
      onChange(row.id);
    } catch (e) {
      setFound(undefined);
      setLookupError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  function useMine() {
    if (!myProfile) return;
    setFound(myProfile);
    setLookupError('');
    onChange(myProfile.id);
  }

  return (
    <div>
      <span className="mb-2 block text-xs text-black/50">
        {label}
        <span className="text-danger ml-1">*</span>
      </span>

      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入对方的用户 ID"
          invalid={Boolean(error ?? lookupError)}
        />
        <Button type="button" variant="second" disabled={!keyword.trim() || pending} onClick={handleLookup}>
          {pending ? '查询中' : '查询'}
        </Button>
      </div>

      {myProfile ? (
        <button type="button" onClick={useMine} className="text-ink-3 mt-2 text-xs underline">
          用我自己的{ROLE_LABEL[role]}档案（{myProfile.display_id}）
        </button>
      ) : null}

      {found && found.id === value ? (
        <p className="text-success mt-2 text-xs">
          已选择 {found.full_name}（{found.display_id}）
        </p>
      ) : null}

      <p className="text-danger min-h-[18px] text-xs">{error ?? lookupError}</p>
    </div>
  );
}
