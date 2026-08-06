import { useNavigate, useParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, useToast } from '@/components/ui';
import { formatDateTime, ROLE_LABEL } from '@/lib/format';
import type { Counterparty, CounterpartyInput, Role } from '@/lib/schema';
import CounterpartyForm from './CounterpartyForm';
import { useCounterparty, useCreateCounterparty, useUpdateCounterparty } from './hooks';

/** DB 行 → 表单默认值：把 null 转成 undefined，避免受控 input 收到 null */
function toFormValues(row: Counterparty | undefined): Partial<CounterpartyInput> | undefined {
  if (!row) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || k === 'display_id' || k === 'created_by' || k === 'created_at' || k === 'updated_at') {
      continue;
    }
    out[k] = v === null ? undefined : v;
  }
  return out as Partial<CounterpartyInput>;
}

export default function CounterpartyFormPage({ role, mode }: { role: Role; mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const label = ROLE_LABEL[role];
  const basePath = role === 'buyer' ? '/buyers' : '/sellers';

  const detail = useCounterparty(mode === 'edit' ? id : undefined);
  const create = useCreateCounterparty();
  const update = useUpdateCounterparty(id ?? '');

  if (mode === 'edit' && detail.isLoading) {
    return <div className="text-ink-4 text-sm">加载中...</div>;
  }
  if (mode === 'edit' && detail.isError) {
    return <div className="text-danger text-sm">加载失败：{(detail.error as Error).message}</div>;
  }

  function handleSubmit(values: CounterpartyInput) {
    if (mode === 'create') {
      create.mutate(values, {
        onSuccess: (row) => {
          toast.success(`创建成功，用户 ID ${row.display_id}`);
          navigate(`${basePath}/${row.id}`, { replace: true });
        },
        onError: (e) => toast.error((e as Error).message),
      });
    } else {
      update.mutate(values, {
        onSuccess: () => toast.success('保存成功'),
        onError: (e) => toast.error((e as Error).message),
      });
    }
  }

  return (
    <>
      <PageHeader
        title={mode === 'create' ? `新建${label}` : `${label}详情`}
        actions={
          <Button variant="second" onClick={() => navigate(basePath)}>
            返回列表
          </Button>
        }
      />

      {mode === 'edit' && detail.data ? (
        <div className="rounded-card bg-surface mb-5 flex gap-10 px-6 py-4 text-sm">
          <span>
            用户 ID <b className="ml-2">{detail.data.display_id}</b>
          </span>
          <span className="text-ink-3">创建于 {formatDateTime(detail.data.created_at)}</span>
        </div>
      ) : null}

      <CounterpartyForm
        role={role}
        key={detail.data?.id ?? 'new'}
        defaultValues={toFormValues(detail.data)}
        submitting={create.isPending || update.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
