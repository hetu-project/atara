// 后端 JSON 的类型。字段名逐一对齐 atara-pay 的 internal/api/dto.go 与各 handler，
// 不是猜的。契约本身是从旧 console.html 的写死数据反推的，所以这一层写成强类型——
// 字段名对不上是这次联调最大的风险，编译期挡住比运行时 undefined 好得多。

/** 统一错误信封。对接方按 code 分支，不要匹配 message。 */
export interface ApiErrorBody {
  code: string
  field?: string
  message: string
  remedy?: {
    action: string
    value?: string
    values?: string[]
    label: string
  }
}

/** 金额一律是十进制字符串主单位，绝不用 number——float 会静默改尾数。 */
export interface Amount {
  amount: string
  asset: string
  scale: number
}

export interface User {
  id: string
  address: string
  display_name: string
  email: string
  kind: 'person' | 'firm' | 'agent'
  wallet_kind: 'atara' | 'ext'
  login_method: string
  hue: number
  avatar_url: string
  role: 'user' | 'reviewer'
  created_at: string
}

export interface WalletAsset {
  asset: string
  on_chain: string
  in_escrow: string
  usd_value: string
  networks: string[]
}

export interface Wallet {
  address: string
  wallet_kind: 'atara' | 'ext'
  /** 恒为 self——平台不持有资金。 */
  custody: string
  on_chain_usd: string
  in_escrow_usd: string
  total_usd: string
  assets: WalletAsset[]
  escrow_contract: { address: string; network: string }
  spending_contract: string
}

export interface Maker {
  name: string
  peer_code: string
  trust_score: number
  deals: number
  disputes: number
  fill_rate: string
  median_release_secs: number
  /** 资质件缺项也照发——缺件也公开，让买家自己给缺口定价。 */
  docs: Record<string, boolean>
}

export interface Offer {
  id: string
  side: 'buy' | 'sell'
  asset: string
  network: string
  networks: string[]
  fiat: string
  unit_price: string
  qty: string
  /** 币单位。 */
  remaining_qty: string
  /** 法币单位。 */
  fiat_ceiling: string
  /** 法币单位——与 remaining_qty 不是同一个单位，不可混比。 */
  min_lot: string
  status: 'active' | 'filled' | 'delisted'
  maker: Maker
  created_at: string
}

/** 前端 OSTATE 的五个阶段。后端按当前调用者的视角算好，直接渲染。 */
export type Phase = 'pay' | 'verify' | 'wait' | 'lock' | 'rel'
/** 这一步该谁动手。 */
export type Actor = 'you' | 'them' | 'auto'

export type OrderState =
  | 'match' | 's1' | 's3' | 's3v' | 's4' | 's5'
  | 'cancelled' | 'expired' | 'disputed'
  | 'fund' | 'locked' | 'awaiting_counterparty' | 'awaiting_me' | 'releasing' | 'released'

export type Terminal = '' | 'completed' | 'cancelled' | 'expired' | 'disputed'

export interface RailStop {
  key: string
  label: string
  state: 'done' | 'now' | 'next'
  /** 后端标签是 waiting_on，不是 who。 */
  waiting_on?: string
}

export interface Escrow {
  contract: string
  network: string
  explorer: string
  funding_via?: string
  tx_hash?: string
  confirmations: number
  required: number
  needs_funding: boolean
}

export interface OtcLeg {
  offer_id: string
  /** taker 视角：buy 表示 taker 买币、出法币。 */
  side: 'buy' | 'sell'
  funding_via?: string
  unit_price: string
  fiat_code: string
  fiat_amount: string
  network: string
  receipt_ref?: string
}

export interface OrderEvent {
  seq: number
  from_state: string
  to_state: string
  actor: string
  reason: string
  payload?: Record<string, string>
  created_at: string
}

export interface Order {
  id: string
  ref: string
  kind: 'otc_take' | 'conditional_transfer'
  state: OrderState
  terminal?: Terminal
  /** 终态、条件支付、局外人查询时为 null。 */
  phase: Phase | null
  actor: Actor | null
  amount: Amount
  note?: string
  counterparty_name?: string
  counterparty_id?: string
  card_id?: string
  state_deadline?: string
  seconds_left: number
  escrow?: Escrow
  rail: RailStop[]
  otc?: OtcLeg
  events?: OrderEvent[]
  created_at: string
}

export interface Task {
  id: string
  order_ref: string
  title: string
  state: 'you' | 'run' | 'done'
  at: string
}

/** 确认令牌的两个档位。承诺档不能冒充签名档，反向可以。 */
export type Grade = 'signature' | 'commit'

export interface Confirmation {
  confirmation: string
  expires_at: string
  grade: Grade
  header: string
}

export interface EligiblePeer {
  user_id: string
  display_name: string
  peer_code: string
  hue: number
  avatar_url: string
  trust_score: number
  deals: number
  best_price: string
  available_qty: string
}

export interface MatchCandidate {
  offer_id: string
  name: string
  peer_id: string
  trust_score: number
  deals: number
  unit_price: string
  fiat: string
  coin_amount: string
  fiat_amount: string
}

export interface MatchResult {
  scanned: number
  candidates: MatchCandidate[]
  violation?: ApiErrorBody
}

/** money.Asset。注意 USDRate 在后端标了 json:"-"，不出参——前端拿不到汇率。 */
export interface CatalogAsset {
  code: string
  kind: 'crypto' | 'fiat'
  name: string
  symbol: string
  scale: number
  networks?: string[]
  corridor?: string
}
