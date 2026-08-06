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
const AMOUNT_MAX_DP = 8;

/** 数值的十进制小数位数。用字符串形式判断，避免浮点二进制表示带来的误差。 */
function decimalPlaces(n: number): number {
  const s = n.toString();
  const exp = /e-(\d+)$/.exec(s);
  if (exp) return Number(exp[1]);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** 四舍五入到 8 位小数后是否变成了 0（数据库 numeric(38,8) 的精度就是这里的依据）。 */
function roundsToZeroAt8dp(n: number): boolean {
  return Math.round(n * 10 ** AMOUNT_MAX_DP) === 0;
}

const orderBase = {
  buyer_id: z.string().uuid('请选择买家'),
  seller_id: z.string().uuid('请选择卖家'),
  // invalid_type_error 是必须的：金额输入框是纯文本框，打错一个字母就会 coerce 成 NaN，
  // 走 zod 默认的英文报错。数据库列是 numeric(38,8)，超过 8 位小数会被静默四舍五入，
  // 按后果拆成两条提示：截断后仍非零 → 提示位数超限；截断后变成 0 → 提示金额过小
  // （否则用户会看到跟内容无关的「填写的内容不符合规则」，那是 DB 的 amount > 0 检查报的）。
  amount: z.coerce
    .number({ invalid_type_error: '请输入有效金额' })
    .positive('金额必须大于 0')
    .refine((n) => !(decimalPlaces(n) > AMOUNT_MAX_DP && !roundsToZeroAt8dp(n)), '最多 8 位小数')
    .refine((n) => !(decimalPlaces(n) > AMOUNT_MAX_DP && roundsToZeroAt8dp(n)), '金额过小'),
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
  /** 档案归属。Task 1 起由 DB 的 default auth.uid() 填充，前端不传。 */
  user_id: string;
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
  // PostgREST 把 numeric 列序列化成 JSON number，所以运行时这里大概率是 number，
  // 不是 string —— 但我们没有可连的 Supabase 项目验证这一点，只能诚实地写成
  // 两者都可能。formatAmount 两种都接受，今天不会炸；但 `order.amount.startsWith(...)`
  // 这类假设它是 string 的写法会在第一次接到真实数据时崩掉。
  // 上线后务必用一次真实请求确认实际类型，并在确认后收窄这个类型。
  amount: string | number;
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
