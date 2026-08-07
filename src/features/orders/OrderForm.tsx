import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FormSection, Input, Select, Textarea } from '@/components/ui';
import CounterpartyPicker from '@/features/counterparties/CounterpartyPicker';
import { useMyProfiles } from '@/features/counterparties/hooks';
import { pickProfile } from '@/features/counterparties/myProfiles';
import { ORDER_TYPE_LABEL, PAYEE_LABEL } from '@/lib/format';
import { ORDER_TYPES, PAYEES, orderSchema, type OrderInput, type OrderType, type Payee } from '@/lib/schema';
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
    setValue,
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
  const payee = watch('payee') as Payee;
  const buyerId = watch('buyer_id') as string;
  const sellerId = watch('seller_id') as string;
  const profiles = useMyProfiles();

  function handleTypeChange(next: OrderType) {
    reset(clearTypeFields(getValues(), next));
  }

  const err = (name: string) => (errors as Record<string, { message?: string } | undefined>)[name]?.message;

  const myPayeeProfile = pickProfile(profiles.data, payee);
  const payeeIsMe = Boolean(myPayeeProfile) && myPayeeProfile!.id === (payee === 'buyer' ? buyerId : sellerId);

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
        <CounterpartyPicker
          role="buyer"
          label="买家"
          value={buyerId}
          onChange={(id) => setValue('buyer_id', id, { shouldValidate: true })}
          error={err('buyer_id')}
          myProfile={pickProfile(profiles.data, 'buyer')}
        />
        <CounterpartyPicker
          role="seller"
          label="卖家"
          value={sellerId}
          onChange={(id) => setValue('seller_id', id, { shouldValidate: true })}
          error={err('seller_id')}
          myProfile={pickProfile(profiles.data, 'seller')}
        />
        <Field label="金额" required error={err('amount')}>
          <Input {...register('amount')} inputMode="decimal" placeholder="请输入金额" invalid={!!err('amount')} />
        </Field>
      </FormSection>

      <p className="text-ink-3 mb-4 max-w-[900px] text-xs">
        请填写{payee === 'buyer' ? '买家' : '卖家'}的收款信息。
        {payeeIsMe
          ? '收款方是你自己时可从档案复制。'
          : '对方的收款信息需要向对方索取 —— 出于隐私保护，系统不会展示其他用户的银行账号或钱包地址。'}
      </p>

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
