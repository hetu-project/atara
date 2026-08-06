import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FormSection, Input, Select, Textarea } from '@/components/ui';
import { COUNTRIES } from '@/lib/countries';
import { ID_TYPE_LABEL } from '@/lib/format';
import { CHAINS, ID_TYPES, counterpartySchema, type CounterpartyInput, type Role } from '@/lib/schema';

interface Props {
  role: Role;
  defaultValues?: Partial<CounterpartyInput>;
  submitting: boolean;
  onSubmit: (values: CounterpartyInput) => void;
}

const ID_TYPE_OPTIONS = ID_TYPES.map((v) => ({ value: v, label: ID_TYPE_LABEL[v] }));
const CHAIN_OPTIONS = CHAINS.map((v) => ({ value: v, label: v }));

export default function CounterpartyForm({ role, defaultValues, submitting, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CounterpartyInput>({
    resolver: zodResolver(counterpartySchema),
    // role 靠这里的 defaultValues 进入提交值，不需要也不要加隐藏 input。
    // react-hook-form 默认会把 defaultValues 里未注册的字段一并提交，
    // 加一个 <input type="hidden" {...register('role')} /> 是死代码 ——
    // 更糟的是它会让人以为 role 由它承载，从而放心删掉这行 defaultValues，
    // 那样 role 会变成 undefined、在 z.enum(ROLES) 处报一个很难懂的错。
    defaultValues: { role, tags: [], ...defaultValues },
  });

  // tags 在 schema 里是 string[]，但输入框只能编辑 string。不能直接
  // `{...register('tags')}` —— 那样提交时 tags 会是一整个逗号分隔的字符串，
  // 而不是数组，zod 会在 tags 上报一个跟标签内容毫无关系的类型错误。
  // 所以这里维护一份独立的文本状态用于展示/编辑，每次变化时用 setValue 把它
  // 拆分成数组写回真正的表单字段，真正提交的值永远是数组。
  const [tagsText, setTagsText] = useState((defaultValues?.tags ?? []).join(', '));

  function handleTagsChange(text: string) {
    setTagsText(text);
    const tags = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    setValue('tags', tags, { shouldValidate: false });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-[900px]">
      <FormSection title="基础身份">
        <Field label="姓名" required error={errors.full_name?.message}>
          <Input {...register('full_name')} invalid={!!errors.full_name} placeholder="请输入姓名" />
        </Field>
        <Field label="国家" error={errors.country?.message as string}>
          <Select {...register('country')} options={COUNTRIES} placeholder="请选择国家" />
        </Field>
        <Field label="证件类型" error={errors.id_type?.message as string}>
          <Select {...register('id_type')} options={ID_TYPE_OPTIONS} placeholder="请选择证件类型" />
        </Field>
        <Field label="证件号" error={errors.id_number?.message as string}>
          <Input {...register('id_number')} placeholder="请输入证件号" />
        </Field>
        <Field label="出生日期" error={errors.date_of_birth?.message as string}>
          <Input type="date" {...register('date_of_birth')} invalid={!!errors.date_of_birth} />
        </Field>
      </FormSection>

      <FormSection title="联系方式">
        <Field label="邮箱" error={errors.email?.message as string}>
          <Input {...register('email')} invalid={!!errors.email} placeholder="name@example.com" />
        </Field>
        <Field label="手机号" error={errors.phone?.message as string}>
          <Input {...register('phone')} placeholder="含国际区号，如 +86 138..." />
        </Field>
        <Field label="Telegram" error={errors.telegram?.message as string}>
          <Input {...register('telegram')} placeholder="@username" />
        </Field>
        <Field label="WhatsApp" error={errors.whatsapp?.message as string}>
          <Input {...register('whatsapp')} placeholder="含国际区号" />
        </Field>
      </FormSection>

      <FormSection title="默认收款信息">
        <Field label="银行名称" error={errors.bank_name?.message as string}>
          <Input {...register('bank_name')} placeholder="请输入银行名称" />
        </Field>
        <Field label="银行户名" error={errors.bank_account_name?.message as string}>
          <Input {...register('bank_account_name')} placeholder="请输入户名" />
        </Field>
        <Field label="银行账号" error={errors.bank_account_number?.message as string}>
          <Input {...register('bank_account_number')} placeholder="请输入账号" />
        </Field>
        <Field label="SWIFT / IFSC" error={errors.bank_swift?.message as string}>
          <Input {...register('bank_swift')} placeholder="选填" />
        </Field>
        <Field label="默认收款地址" error={errors.default_wallet_address?.message as string}>
          <Input {...register('default_wallet_address')} placeholder="请输入钱包地址" />
        </Field>
        <Field label="默认收款链" error={errors.default_wallet_chain?.message as string}>
          <Select {...register('default_wallet_chain')} options={CHAIN_OPTIONS} placeholder="请选择链" />
        </Field>
      </FormSection>

      <FormSection title="备注与标签">
        <div className="col-span-2">
          <Field label="标签" hint="多个标签用英文逗号分隔，如 vip, 高风险">
            <Input
              value={tagsText}
              onChange={(e) => handleTagsChange(e.target.value)}
              placeholder="标签，用逗号分隔"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="备注" error={errors.note?.message as string}>
            <Textarea {...register('note')} placeholder="内部备注，选填" />
          </Field>
        </div>
      </FormSection>

      <Button type="submit" size="lg" loading={submitting}>
        保存
      </Button>
    </form>
  );
}
