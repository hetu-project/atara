import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FormSection, Input, Select, Textarea } from '@/components/ui';
import { ORDER_TYPE_LABEL, PAYEE_LABEL } from '@/lib/format';
import { ORDER_TYPES, PAYEES, orderSchema, type OrderInput, type OrderType } from '@/lib/schema';
import { clearTypeFields, defaultPayee } from './formLogic';
import CryptoFields from './CryptoFields';
import FiatFields from './FiatFields';

const TYPE_OPTIONS = ORDER_TYPES.map((v) => ({ value: v, label: ORDER_TYPE_LABEL[v] }));
const PAYEE_OPTIONS = PAYEES.map((v) => ({ value: v, label: PAYEE_LABEL[v] }));

export default function OrderForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: OrderInput) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
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
          <Input {...register('buyer_id')} placeholder="买家档案 ID" invalid={!!err('buyer_id')} />
        </Field>
        <Field label="卖家" required error={err('seller_id')}>
          <Input {...register('seller_id')} placeholder="卖家档案 ID" invalid={!!err('seller_id')} />
        </Field>
        <Field label="金额" required error={err('amount')}>
          <Input {...register('amount')} inputMode="decimal" placeholder="请输入金额" invalid={!!err('amount')} />
        </Field>
      </FormSection>

      {orderType === 'crypto' ? (
        <CryptoFields register={register} err={err} />
      ) : (
        <FiatFields register={register} err={err} />
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
