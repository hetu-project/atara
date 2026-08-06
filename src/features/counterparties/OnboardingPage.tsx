import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, useToast } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/format';
import { ROLES, type CounterpartyInput, type Role } from '@/lib/schema';
import CounterpartyForm from './CounterpartyForm';
import { useCreateCounterparty } from './hooks';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateCounterparty();
  const [role, setRole] = useState<Role | undefined>();

  function handleSubmit(values: CounterpartyInput) {
    create.mutate(values, {
      onSuccess: (row) => {
        toast.success(`档案已创建，你的用户 ID 是 ${row.display_id}`);
        navigate('/profile', { replace: true });
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  if (!role) {
    return (
      <div className="mx-auto max-w-[720px] py-10">
        <h1 className="text-[30px] leading-[38px] font-semibold">你以哪个身份开始？</h1>
        <p className="text-ink-3 mt-3 text-sm">
          填完表单会得到一个用户 ID。之后可以随时在「我的档案」里补充另一个身份 ——
          同一个账号可以既是买家又是卖家。
        </p>
        <div className="mt-8 flex gap-4">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className="rounded-card bg-surface hover:border-line-strong transition-base flex-1 border border-transparent p-6 text-left"
            >
              <span className="text-lg font-semibold">我是{ROLE_LABEL[r]}</span>
              <span className="text-ink-3 mt-2 block text-sm">
                {r === 'buyer' ? '买入 Crypto 或法币' : '卖出 Crypto 或法币'}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[30px] leading-[38px] font-semibold">填写{ROLE_LABEL[role]}信息</h1>
        <Button variant="second" onClick={() => setRole(undefined)}>
          换个身份
        </Button>
      </div>
      <CounterpartyForm role={role} submitting={create.isPending} onSubmit={handleSubmit} />
    </div>
  );
}
