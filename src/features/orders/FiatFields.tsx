import { Field, FormSection, Input, Select } from '@/components/ui';
import { FIAT_CURRENCIES } from '@/lib/schema';
import type { FieldGroupProps } from './fieldProps';

const FIAT_OPTIONS = FIAT_CURRENCIES.map((v) => ({ value: v, label: v }));

export default function FiatFields({ register, err }: FieldGroupProps) {
  return (
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
  );
}
