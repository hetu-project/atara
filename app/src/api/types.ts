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
  /** 这笔余额实际所在的链，不是「这个币支持哪些链」。 */
  network: string
  on_chain: string
  in_escrow: string
  /** Empty for the gas coin — no quote, and it is kept out of the totals. */
  usd_value: string
  /** The chain's own coin. Pays gas; cannot be listed or sent as a token. */
  native?: boolean
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

/**
 * How a score reads when there may not be one.
 *
 * null is "no settlement record", not a low score, so it must not print as
 * "score null" or quietly become 0. Every surface that shows the number goes
 * through here so the wording stays the same on all of them.
 */
export const scoreText = (s: number | null | undefined) =>
  s == null ? 'not rated yet' : `score ${s}`

/**
 * Which band a merchant score falls in: '' neutral, 'lo' concerning,
 * 'hi' priced as low risk, 'none' never scored.
 *
 * The lower line sits at 65, not at 70 where console.html had it. That
 * threshold was set against the prototype's hand-written 66–97 spread; a score
 * computed from the settlement record runs about 59–89, and its bottom stretch
 * is where thin-but-clean records live. At 70 a maker with four clean trades
 * and a maker with ten defaults in twenty trades were painted the same amber —
 * "shallow record" and "bad record" reading alike, which is the mistake the
 * unrated state was introduced to stop.
 *
 * 85 is not ours to move: PRD §9.1 6c prices at or above it as low risk.
 */
export const scoreBand = (s: number | null | undefined): '' | 'lo' | 'hi' | 'none' => {
  if (s == null) return 'none'
  if (s >= 85) return 'hi'
  if (s < 65) return 'lo'
  return ''
}

export interface Maker {
  name: string
  peer_code: string
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
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
  /** 下架的来源：做市方自己 / 后台强制 / 对账器发现链上已关。只在 delisted 时有值。 */
  delist_reason?: 'maker' | 'admin' | 'chain' | ''
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
  /** taker 视角：buy 表示 taker 买币、出法币。两方看到的是同一个值。 */
  side: 'buy' | 'sell'
  /** 看这一单的人自己的方向。做市方与 side 相反——界面上所有
      「你付 / 你收」的文案都要跟这个走，不要跟 side。 */
  your_side?: 'buy' | 'sell'
  funding_via?: string
  unit_price: string
  fiat_code: string
  fiat_amount: string
  network: string
  receipt_ref?: string
  /** 打开那份回执的链接：后端签过、有时效。ref 只是文件名，单独拿着打不开。 */
  receipt_url?: string
  /** 这笔付款的每一页,按提交顺序。上面那两个字段只指最后一张,留着是给
      只显示一张的旧界面用的——要核验付款的那一方必须看到全部。 */
  receipts?: ReceiptPage[]
}

/** 一笔付款凭证里的一页。 */
export interface ReceiptPage {
  ref: string
  url?: string
  /** 核过没有。分两轮交上来的一组不会整体看着像没人看过。 */
  verified: boolean
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
  /* 该往哪儿转钱。只有欠这笔款的那一方、且只在还没转的时候，后端才发这一段；
     其余任何人拿到的都是 undefined。没有它就是「拿不到收款信息」——
     可能是对方没登记账户，也可能是这台后端没配加密密钥。 */
  payout?: Payout
  escrow?: Escrow
  rail: RailStop[]
  otc?: OtcLeg
  events?: OrderEvent[]
  /**
   * 下单那一刻算出来的风控评分（60–99），存在工单上，之后不重算。
   * 不重算是有意的：评分是对下单当时的判断，跟着后来的事变就不是判断了。
   */
  /** 这一单是不是我发起的（OTC 里就是「我是吃单方」）。撮合那一站还没有
      phase 和 actor，这是唯一能区分两方的字段——确认只属于其中一方。 */
  yours?: boolean
  /** 下单那一刻对手方的信任分快照。跟 Discover 上那个环是同一个来源,
      同一个商户在两处看到的必然是同一个数。null = 那时还没有记录。 */
  trust_score: number | null
  /** 对手方的成绩单与资质件。跟工单一起发，两个数才来自同一时刻。 */
  peer_profile?: PeerProfile
  /** 这一单的手续费，下单那一刻定死的。 */
  fee?: { amount: string; currency: string; bps: number }
  /** 下单前那次风控评估的快照。没跑过就没有。 */
  assessment?: OrderAssessment
  /** 终态才有：这单最后靠什么收的口。 */
  evidence?: Evidence
  created_at: string
}

export interface PeerProfile {
  name: string
  peer_code?: string
  deals: number
  disputes: number
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  docs?: Record<string, boolean>
}

export interface OrderAssessment {
  score: number
  passed: number
  total: number
  threshold: number
  summary: string
  votes: { agent: string; verdict: 'pass' | 'flag'; note: string; score?: number }[]
  /** 读了多少来源、多少记录。由评估器报，前端不编。 */
  sources: number
  records: number
  /** 这次评估真正花了多少毫秒。不到一秒就不印秒数——不编一个好看的数。 */
  took_ms?: number
}

export interface Evidence {
  outcome: 'completed' | 'cancelled' | 'expired' | 'disputed'
  receipt_ref?: string
  /** 同 OTC.receipt_url。 */
  receipt_url?: string
  settled_at?: string
  /**
   * Present on orders that reached `disputed`, ruled on or not.
   *
   * `raised_by: 'system'` means nobody raised anything — a window closed with
   * neither side having spoken. `decided_at` is absent until a reviewer
   * actually rules, and the two are independent: an escalation sits here with
   * a `raised_at` and no decision at all.
   *
   * `raised_by` and `fault` are already resolved to the viewer's seat by the
   * backend — "you" or "them", not user ids — the same way `phase` is. Both
   * sides of one order are looking at different facts about it, and deriving
   * that in two places is how two screens come to disagree.
   *
   * `fault` empty means the reviewer was never asked (rulings made before the
   * console had the field). That is not the same as 'none': one says nobody was
   * responsible, the other says nobody answered.
   */
  arbitration?: {
    raised_at?: string
    raised_by?: 'you' | 'them' | 'system'
    claim?: string
    decided_at?: string
    decision?: 'release' | 'refund'
    fault?: 'you' | 'them' | 'none'
  }
  chain?: {
    kind: string; amount?: string; tx_hash?: string
    /** 区块浏览器上这笔交易的地址。mock 链上没有，那时就不给链接。 */
    explorer?: string
    memo?: string; at: string
  }[]
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
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  deals: number
  best_price: string
  available_qty: string
}

export interface MatchCandidate {
  offer_id: string
  name: string
  peer_id: string
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
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
/** 一条链，以及我们在上面部署了没有。来自 GET /catalog/chain。 */
export interface ChainRow {
  /** 网络码。挂单、订单里写的就是它。 */
  code: string
  name: string
  /** EIP-155 链号。钱包切链认的是它，不是名字。 */
  chain_id: number
  testnet: boolean
  explorer: string
  /** 这条链上付 gas 用的币。钱包添加链时要用。 */
  native: string
  /**
   * 有没有托管合约。「支持这条链」和「这条链上能挂卖单」不是一回事——
   * 没部署就锁不了币，界面要照实说，不能让人填完了才在签名时被拒。
   */
  deployed: boolean
  escrow: string
  spending: string
  rpc_url: string
  tokens: Record<string, { address: string; decimals: number }>
  updated_at?: string
}

export interface ChainInfo {
  /** mock 时没有任何一条链是 deployed —— 这一版不发交易。 */
  impl: 'mock' | 'evm'
  chains: ChainRow[]
}

/** /offers/prepare 的回执：去锁币要用的全部参数。 */
export interface PreparedOffer {
  offer_id: string
  /** 合约里的 bytes32。哈希规则在后端一处，前端原样带走。 */
  offer_key: string
  escrow: string
  token: string
  decimals: number
  /** 已按代币精度换算好——前端不自己乘 10^n，算错就是 10^12 倍的差。 */
  amount_wei: string
  chain_id: number
  network: string

  /* 外部入金那一档。空表示这台服务器没开这个功能（没配工厂）。
     deposit_total 才是**要让人转的数**——它等于挂单量加手续费，比 amount_wei
     大一点。拿 amount_wei 去显示的话，人转的会比该转的少，扫不动。 */
  deposit_addr?: string
  deposit_total?: string
  deposit_fee?: string
  /** Unix 秒。过了这个点这份配置不再自动上架，钱只能取回。 */
  deposit_expiry?: number
}

/*
一笔币在合约里、挂单却没建出来的锁仓。见后端 app.StrandedLock。

挂卖单是三步——要号 → 钱包锁币 → 建挂单——中间那一步不可撤销，第三步还会
失败。失败之后这个号在浏览器里只活在 localStorage，换台设备就没了；服务端这
一份是它在任何设备上都找得回来的保证。
*/
export interface StrandedLock {
  offer_id: string
  asset: string
  qty: string
  /** 此刻合约里还能挂出去的量。 */
  available: string
  /** 当初填的那份挂单，原样重发。已经带上 offer_id。 */
  form: {
    side: 'buy' | 'sell'
    asset: string
    fiat: string
    unit_price: string
    qty: string
    min_lot: string
    network: string
    networks?: string[]
    offer_id?: string
  }
  at: string
  /** 挂单已下架、币却还锁在合约里。出口是解锁，不是重发——见后端 StrandedLock.Delisted。 */
  delisted?: boolean
}

/** 一笔外部入金此刻怎么样了。见后端 app.DepositStatus。 */
export interface DepositStatus {
  status: 'waiting' | 'swept' | 'expired'
  address: string
  /** 挂单量。要转的是它加手续费，不是它本身。 */
  need: string
  /** 此刻链上真有的。收到一部分时它介于 0 和 need 之间。 */
  received: string
  sweep_tx?: string
  /** 挂单是不是真的上架了。和「已扫进托管」是两件事——扫币在链上，建挂单在
      它之后，后者失败过。 */
  listed: boolean
  expires_at: number
}

export interface CatalogAsset {
  code: string
  kind: 'crypto' | 'fiat'
  name: string
  symbol: string
  scale: number
  networks?: string[]
  corridor?: string
}

// ── 支配权（额度）──

/**
 * 额度是签进链上的支配权，不是平台的额度表——平台只记着链上签发了什么。
 * 可撤销、有周期窗口、有单笔上限、可限定收款方。
 */
export interface Allowance {
  id: string
  spender: string
  kind: 'person' | 'agent'
  asset: string
  /** 这份授权在哪条链上。空是旧数据（那时只有一条链）。 */
  network: string
  per_payment: string
  window_cap: string
  used: string
  cycle: 'weekly' | 'monthly'
  expires_at: string | null
  recipients: string
  template?: string
  wallet_kind: 'atara' | 'ext'
  chain_tx?: string
  status: 'live' | 'revoked'
  note?: string
}

// ── 收款方与提现 ──

/**
 * 一笔单的收款信息,发给该付款的那一方。
 *
 * 跟 BankAccount 不是一个东西:那个是「我自己的账户簿」,号码永远是掩码;
 * 这个是「你要把钱打到这里」,号码是完整的——掩码转不了账。
 */
export interface Payout {
  holder: string
  bank: string
  account_no: string
  currency: string
  region: string
}

/** 法币收款账户。account_no 恒为掩码——全量号码从不落库。 */
export interface BankAccount {
  id: string
  holder: string
  bank: string
  account_no: string
  currency: string
  region: string
  created_at: string
  updated_at: string
}

export interface Payee {
  id: string
  label: string
  chain: string
  address: string
  created_at: string
}

export type WithdrawalState = 'draft' | 'submitted' | 'broadcast' | 'confirmed' | 'failed'

export interface Withdrawal {
  id: string
  payee_id: string
  asset: string
  amount: string
  purpose: string
  doc_upload_id?: string
  tx_hash?: string
  state: WithdrawalState
  created_at: string
  updated_at: string
  payee_label: string
  payee_chain: string
  payee_address: string
}

// ── Discover 与做市准入 ──

export interface Market {
  key: string
  name: string
  live: boolean
  desc?: string
  /** [维度, 说明] 的二元组。 */
  map?: [string, string][]
}

/**
 * 做市申请。四个状态位驱动前端那颗按钮的三种文案：
 * approved → 「挂单」；listing_done 未审 → 「审核中」；其余 → 「成为做市方」。
 */
/** 证件上读出来、可以摆在界面上的那几项。证件号已经在后端打过码。 */
export interface KycIdentity {
  first_name?: string
  last_name?: string
  full_name?: string
  doc_type?: string
  /** 已打码，只剩末四位。全号留在后端——见后端 kyc.maskDoc。 */
  doc_number?: string
  dob?: string
  issued?: string
  expiry?: string
  sex?: string
  nationality?: string
  country?: string
}

/** 一条没通过的检查。severity 与 decision 由 ID Analyzer 的配置档算出来。 */
export interface KycWarning {
  code: string
  description: string
  severity?: string
  confidence?: number
  decision?: string
}

/** 从注册文件上读出来的公司信息。跟 KycIdentity 对称。 */
export interface KybBusiness {
  legal_name?: string
  reg_number?: string
  entity_type?: string
  /** YYYY-MM-DD */
  incorporated?: string
  /** Incorporated / Dissolved … */
  status?: string
  /** ISO2 */
  country?: string
  address?: string
  city?: string
  postcode?: string
  doc_type?: string
  official?: boolean
  directors?: string[]
}

/** 一次企业核验的结论。 */
export interface KybResult {
  status: 'accept' | 'review' | 'reject'
  /** 这个结论对应的那份文件。手上这份跟它一样，就不用再问一次。 */
  file_ref?: string
  business: KybBusiness
  warnings?: { code: string; description: string; severity: string; decision: string }[]
  /** 这次没有核验任何东西（读的是本地 fixture）。界面必须说出来。 */
  simulated: boolean
}

/** 一条法币收款渠道。由后端目录发,不在前端写死——见 useRails 的说明。 */
export interface Rail { name: string; fiat: string }
export interface RailGroup { group: string; fiat: string; rails: Rail[] }

export interface KycStatus {
  /** none 从没开过 · pending 开了还没结论 · accept/review/reject 是结论 */
  state: 'none' | 'pending' | 'accept' | 'review' | 'reject'
  reference?: string
  identity?: KycIdentity
  warnings?: KycWarning[]
  /** 我们自己的批注，跟 warnings 分开——那些是核验服务的原话。
      目前只有一种：这张证件已经在别的账号名下，所以结论被降到了 review。 */
  note?: string
  kyc_ok: boolean
  concluded_at?: string
  /** 这台机器配没配 ID Analyzer。没配时要照实说，不能摆一颗按不动的按钮。 */
  configured: boolean
  /**
   * 这一步是模拟的（后端 ATARA_KYC=false）。
   *
   * 必须在界面上显式说出来：一个「已通过」的绿勾背后是真核验还是本地开关，
   * 看的人有权知道——藏起来的话，谁截个图就能拿去当作「我们验过了」。
   */
  simulated?: boolean
}

/** 开一次核验会话拿到的东西。API key 不在里面，也永远不会在里面。 */
export interface KycSession {
  reference: string
  url: string
  qr_code?: string
}

/** 预审的一条指摘。fields 是表单字段 key，一定非空——指不到字段的意见后端已经丢掉了。 */
export interface ReviewIssue {
  fields: string[]
  says: string
  ask: string
  route?: 'revise' | 'escalate'
}

export interface MakerApp {
  user_id: string
  phase: 'kyc' | 'listing'
  kyc_done: boolean
  kyc_ok: boolean
  listing_done: boolean
  approved: boolean
  form: string
  /** 半路存下的那份,还没提交。表单重开时恢复它,提交后后端会清掉。 */
  draft?: Record<string, unknown>
  /** 最近一次企业核验的结论。企业那条路第 3 步拿它预填并锁住。 */
  kyb?: KybResult
  /** 这份草稿属于哪一段。两段表单字段完全不同,恢复错了比不恢复更糟。 */
  draft_phase?: 'kyc' | 'listing'
  /** 上次填到第几步。丢掉它的话,内容记住了却还要从头点八页。 */
  draft_step?: number
  reject_reason?: string
  /**
   * 最近一次预审逐项的问题。每条都指到表单字段的 key——界面据此把话
   * 标在出问题的那一项上，而不是让人对着一段摘要自己回表里翻。
   */
  review_issues?: ReviewIssue[]
  /** Who made the last call: 'rule' | 'ai' | 'human'. Shown as attribution. */
  review_source?: 'rule' | 'ai' | 'human'
  review_model?: string
  /** 已经申诉过了。非空表示这一份在等人看，界面上不该再给第二颗申诉按钮。 */
  appeal_note?: string
  appealed_at?: string
  submitted_at?: string
  reviewed_at?: string
  reviewer_id?: string
  updated_at: string
  display_name?: string
}

// ── 联系人与会话 ──

/** /accounts/search 的一行。它不是联系人——还没有任何关系，只是「这个人存在」。 */
export interface Account {
  id: string
  address: string
  name: string
  kind: string
  deals: number
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  /** 我跟这个人现在的关系。空=还没有，pending=等他点头，accepted=已经是联系人。 */
  relation?: '' | 'pending' | 'accepted'
}

export interface Contact {
  id: string
  address: string
  name: string
  kind: string
  /** Supplier / Client / Colleague / Friend / My agent */
  label: string
  nickname?: string
  /** pending 表示还等着对方点头。pending 的人不能被指定为收款方。 */
  status?: 'pending' | 'accepted'
  deals: number
  fill_rate: string
  /** 往来净额，正数=对方欠我。 */
  net: string
  since: string
}

export interface Message {
  id: string
  peer_id: string
  /* 后端发的是 'them' 不是 'peer'（见 store.PostBothTx：副本那条写的就是 them）。
     这里原本写的 'peer'，谁按它分支就永远不命中，而 TS 一句话都不会说——
     现有的 Thread.tsx 是靠「不是 me 就当对方」躲过去的。 */
  author: 'me' | 'them' | 'system'
  kind: 'chat' | 'system' | 'order' | 'assessment'
  body: string
  order_id?: string
  /** AI 回答之前想了多久（毫秒）。只有它自己的回答上有。 */
  thought_ms?: number
  payload?: Record<string, string>
  created_at: string
}

export interface Thread {
  /** 后端回的是完整的 User，不是名字字符串。 */
  peer: User
  messages: Message[]
  orders: Order[]
  merchant?: Maker
}

// ── 条件支付 ──

export interface ConditionAtom {
  atom_type: 'approve' | 'evidence' | 'data' | 'time'
  params: Record<string, string>
}

export interface ConditionParam {
  key: string
  control: 'pick' | 'text' | 'date'
  options?: string[]
  options_by?: Record<string, string[]>
  depends_on?: string
  placeholder?: string
}

export interface ConditionCatalog {
  max: number
  atoms: { type: string; label: string; params: ConditionParam[] }[]
  fallback: { default_days: number; note: string }
}

/** 左栏会话行。后端 /threads 返回的汇总。 */
export interface ThreadSummary {
  /** 对方说了、我还没看的条数。只数对方的话，系统播报不算。 */
  unread?: number
  peer_id: string
  peer_name: string
  last: string
  last_at: string
  count: number
}

/** 一个 agent 的票。verdict 只有 pass / flag 两值；note 是它给的理由。 */
export interface AgentVote {
  agent: string
  verdict: 'pass' | 'flag'
  note: string
  /** 这个 agent 单独给的分。后端按工单号算，同一单稳定、不同单散开。 */
  score?: number
}

/** 对手方评估。threshold 是放行门槛——passed 不到它就是拦下转人工。 */
export interface Assessment {
  score: number
  passed: number
  total: number
  threshold: number
  votes: AgentVote[]
  summary: string
}
