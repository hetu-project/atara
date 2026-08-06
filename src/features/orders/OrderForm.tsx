import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FormSection, Input, Select, Textarea, type Option } from '@/components/ui';
import { ORDER_TYPE_LABEL, PAYEE_LABEL } from '@/lib/format';
import {
  ASSETS,
  CHAINS,
  FIAT_CURRENCIES,
  ORDER_TYPES,
  PAYEES,
  orderSchema,
  type OrderInput,
  type OrderType,
  type Payee,
} from '@/lib/schema';
import type { CounterpartyOption } from '@/features/counterparties/api';
import { useCounterpartyOptions } from '@/features/counterparties/hooks';
import { clearTypeFields, defaultPayee, payeeDefaults } from './formLogic';

const TYPE_OPTIONS = ORDER_TYPES.map((v) => ({ value: v, label: ORDER_TYPE_LABEL[v] }));
const PAYEE_OPTIONS = PAYEES.map((v) => ({ value: v, label: PAYEE_LABEL[v] }));
const ASSET_OPTIONS = ASSETS.map((v) => ({ value: v, label: v }));
const CHAIN_OPTIONS = CHAINS.map((v) => ({ value: v, label: v }));
const FIAT_OPTIONS = FIAT_CURRENCIES.map((v) => ({ value: v, label: v }));

function toOptions(rows: CounterpartyOption[] | undefined): Option[] {
  return (rows ?? []).map((r) => ({ value: r.id, label: `${r.full_name}（${r.display_id}）` }));
}

export default function OrderForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: OrderInput) => void;
}) {
  const buyers = useCounterpartyOptions('buyer');
  const sellers = useCounterpartyOptions('seller');

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    setValue,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order_type: 'crypto' as OrderType,
      payee: defaultPayee('crypto'),
      buyer_id: '',
      seller_id: '',
      amount: '',
      asset: '',
      chain: '',
      receiving_address: '',
      fiat_currency: '',
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
      bank_swift: '',
      note: '',
    },
  });

  const orderType = watch('order_type') as OrderType;
  const payee = watch('payee') as Payee;
  const buyerId = watch('buyer_id') as string;
  const sellerId = watch('seller_id') as string;

  // 收款方或订单类型变化时，从对应档案带出默认收款信息。
  //
  // 依赖里必须带上 buyers.data / sellers.data（要从中查出选中那条档案），
  // 这意味着列表数据一旦刷新，本 effect 就会重跑、覆盖用户手改过的收款字段。
  // 目前不会发生，但**理由不是 staleTime** —— counterparty 的增改会调
  // invalidateQueries({ queryKey: ['counterparties'] })，那是精确失效，绕过 staleTime。
  // 真正的原因是路由一次只挂载一个页面：能触发那个 mutation 的 /buyers、/sellers
  // 与本表单互斥。若将来在订单表单里加"快速新建买家/卖家"的浮层，这个前提就没了，
  // 届时需要把带出逻辑改成只在用户主动切换收款方时触发。
  useEffect(() => {
    const partyId = payee === 'buyer' ? buyerId : sellerId;
    if (!partyId) return;
    const rows = payee === 'buyer' ? buyers.data : sellers.data;
    const full = (rows ?? []).find((r) => r.id === partyId);
    for (const [k, v] of Object.entries(payeeDefaults(orderType, full))) {
      setValue(k, v, { shouldValidate: false });
    }
  }, [orderType, payee, buyerId, sellerId, buyers.data, sellers.data, setValue]);

  function handleTypeChange(next: OrderType) {
    reset(clearTypeFields(getValues(), next));
  }

  const err = (name: string) => (errors as Record<string, { message?: string } | undefined>)[name]?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-[900px]">
      <FormSection title="订单基础">
        <Field label="订单类型" required error={err('order_type')}>
          <Select
            options={TYPE_OPTIONS}
            value={orderType}
            onChange={(e) => handleTypeChange(e.target.value as OrderType)}
          />
        </Field>
        <Field label="收款方" required error={err('payee')}>
          <Select {...register('payee')} options={PAYEE_OPTIONS} invalid={!!err('payee')} />
        </Field>
        <Field label="买家" required error={err('buyer_id')}>
          <Select
            {...register('buyer_id')}
            options={toOptions(buyers.data)}
            placeholder="请选择买家"
            invalid={!!err('buyer_id')}
          />
        </Field>
        <Field label="卖家" required error={err('seller_id')}>
          <Select
            {...register('seller_id')}
            options={toOptions(sellers.data)}
            placeholder="请选择卖家"
            invalid={!!err('seller_id')}
          />
        </Field>
        <Field label="金额" required error={err('amount')}>
          <Input {...register('amount')} inputMode="decimal" placeholder="请输入金额" invalid={!!err('amount')} />
        </Field>
      </FormSection>

      {orderType === 'crypto' ? (
        <FormSection title="Crypto 收款信息">
          <Field label="币种" required error={err('asset')}>
            <Select {...register('asset')} options={ASSET_OPTIONS} placeholder="请选择币种" invalid={!!err('asset')} />
          </Field>
          <Field label="链" required error={err('chain')}>
            <Select {...register('chain')} options={CHAIN_OPTIONS} placeholder="请选择链" invalid={!!err('chain')} />
          </Field>
          <div className="col-span-2">
            <Field
              label="收款地址"
              required
              error={err('receiving_address')}
              hint="已按所选收款方的默认地址带出，可修改"
            >
              <Input
                {...register('receiving_address')}
                placeholder="请输入收款地址"
                invalid={!!err('receiving_address')}
              />
            </Field>
          </div>
        </FormSection>
      ) : (
        <FormSection title="法币收款信息">
          <Field label="法币币种" required error={err('fiat_currency')}>
            <Select
              {...register('fiat_currency')}
              options={FIAT_OPTIONS}
              placeholder="请选择币种"
              invalid={!!err('fiat_currency')}
            />
          </Field>
          <Field label="银行名称" error={err('bank_name')}>
            <Input {...register('bank_name')} placeholder="请输入银行名称" />
          </Field>
          <Field label="银行户名" error={err('bank_account_name')}>
            <Input {...register('bank_account_name')} placeholder="请输入户名" />
          </Field>
          <Field label="SWIFT / IFSC" error={err('bank_swift')}>
            <Input {...register('bank_swift')} placeholder="选填" />
          </Field>
          <div className="col-span-2">
            <Field
              label="收款账号"
              required
              error={err('bank_account_number')}
              hint="已按所选收款方的默认账号带出，可修改"
            >
              <Input
                {...register('bank_account_number')}
                placeholder="请输入收款账号"
                invalid={!!err('bank_account_number')}
              />
            </Field>
          </div>
        </FormSection>
      )}

      <FormSection title="备注">
        <div className="col-span-2">
          <Field label="备注" error={err('note')}>
            <Textarea {...register('note')} placeholder="内部备注，选填" />
          </Field>
        </div>
      </FormSection>

      <Button type="submit" size="lg" loading={submitting}>
        创建订单
      </Button>
    </form>
  );
}
