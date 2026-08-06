import { z } from 'zod';

// ---------------- 枚举常量 ----------------
export const ROLES = ['buyer', 'seller'] as const;
export const ID_TYPES = ['passport', 'id_card', 'driver_license'] as const;
export const CHAINS = ['TRON', 'ETH', 'BSC', 'SOL', 'BTC', 'POLYGON'] as const;
export const ASSETS = ['USDT', 'USDC', 'BTC', 'ETH', 'TRX', 'BNB'] as const;
export const FIAT_CURRENCIES = ['USD', 'EUR', 'INR', 'GBP', 'AED', 'HKD', 'CNY'] as const;
export const ORDER_TYPES = ['crypto', 'fiat'] as const;
export const ORDER_STATUSES = ['pending_payment', 'paid', 'completed', 'cancelled'] as const;
export const PAYEES = ['buyer', 'seller'] as const;

export type Role = (typeof ROLES)[number];
export type IdType = (typeof ID_TYPES)[number];
export type Chain = (typeof CHAINS)[number];
export type Asset = (typeof ASSETS)[number];
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Payee = (typeof PAYEES)[number];

// ---------------- 选填字段辅助 ----------------
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const optText = z.preprocess(blankToUndefined, z.string().trim().max(200).optional());
const optLongText = z.preprocess(blankToUndefined, z.string().trim().max(2000).optional());
const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankToUndefined, z.enum(values).optional());

// ---------------- counterparty ----------------
export const counterpartySchema = z.object({
  role: z.enum(ROLES),
  full_name: z.string().trim().min(1, '请填写姓名').max(200),

  id_type: optEnum(ID_TYPES),
  id_number: optText,
  country: optText,
  date_of_birth: z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), '日期格式不正确')
      .refine((v) => new Date(v) <= new Date(), '出生日期不能晚于今天')
      .optional(),
  ),

  email: z.preprocess(blankToUndefined, z.string().email('邮箱格式不正确').optional()),
  phone: optText,
  telegram: optText,
  whatsapp: optText,

  bank_name: optText,
  bank_account_name: optText,
  bank_account_number: optText,
  bank_swift: optText,
  default_wallet_address: optText,
  default_wallet_chain: optEnum(CHAINS),

  note: optLongText,
  tags: z.array(z.string()).default([]),
});

export type CounterpartyInput = z.infer<typeof counterpartySchema>;

// ---------------- order ----------------
const orderBase = {
  buyer_id: z.string().uuid('请选择买家'),
  seller_id: z.string().uuid('请选择卖家'),
  // invalid_type_error 是必须的：金额输入框是纯文本框，用户打错一个字母就会
  // coerce 成 NaN，走 zod 默认的英文报错 "Expected number, received nan"。
  amount: z.coerce.number({ invalid_type_error: '请输入有效金额' }).positive('金额必须大于 0'),
  payee: z.enum(PAYEES),
  note: optLongText,
};

export const cryptoOrderSchema = z.object({
  ...orderBase,
  order_type: z.literal('crypto'),
  asset: z.enum(ASSETS),
  chain: z.enum(CHAINS),
  receiving_address: z.string().trim().min(1, '请填写收款地址'),
});

export const fiatOrderSchema = z.object({
  ...orderBase,
  order_type: z.literal('fiat'),
  fiat_currency: z.enum(FIAT_CURRENCIES),
  bank_account_number: z.string().trim().min(1, '请填写收款账号'),
  bank_name: optText,
  bank_account_name: optText,
  bank_swift: optText,
});

export const orderSchema = z
  .discriminatedUnion('order_type', [cryptoOrderSchema, fiatOrderSchema])
  .refine((d) => d.buyer_id !== d.seller_id, {
    message: '买家和卖家不能是同一人',
    path: ['seller_id'],
  });

export type OrderInput = z.infer<typeof orderSchema>;

// ---------------- DB 行类型 ----------------
// 注意：选填列在 Postgres 里是 null，不是 undefined。这里必须如实写 `| null`，
// 否则回填表单时会把 null 塞进 <input value>，React 会报 uncontrolled 警告。
export interface Counterparty {
  id: string;
  display_id: string;
  role: Role;
  full_name: string;
  id_type: IdType | null;
  id_number: string | null;
  country: string | null;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift: string | null;
  default_wallet_address: string | null;
  default_wallet_chain: Chain | null;
  note: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_no: string;
  buyer_id: string;
  seller_id: string;
  order_type: OrderType;
  status: OrderStatus;
  amount: string;
  payee: Payee;
  asset: Asset | null;
  chain: Chain | null;
  receiving_address: string | null;
  fiat_currency: FiatCurrency | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 列表/详情查询带出的关联方摘要 */
export interface OrderWithParties extends Order {
  buyer: Pick<Counterparty, 'id' | 'display_id' | 'full_name'> | null;
  seller: Pick<Counterparty, 'id' | 'display_id' | 'full_name'> | null;
}

export interface OrderStatusLog {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  created_at: string;
}
