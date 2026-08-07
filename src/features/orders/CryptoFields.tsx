import { Field, FormSection, Input, Select } from '@/components/ui';
import { ASSETS, CHAINS } from '@/lib/schema';
import type { FieldGroupProps } from './fieldProps';

const ASSET_OPTIONS = ASSETS.map((v) => ({ value: v, label: v }));
const CHAIN_OPTIONS = CHAINS.map((v) => ({ value: v, label: v }));

export default function CryptoFields({ register, err }: FieldGroupProps) {
  return (
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
          hint="收款方是你自己时可从档案复制；是对方时请向对方索取"
        >
          <Input
            {...register('receiving_address')}
            placeholder="请输入收款地址"
            invalid={!!err('receiving_address')}
          />
        </Field>
      </div>
    </FormSection>
  );
}
