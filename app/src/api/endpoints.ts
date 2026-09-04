import { ApiError, BASE, api, getIdentity, withConfirmation } from './client'
import type {
  Allowance, CatalogAsset, ConditionCatalog, Contact, EligiblePeer, MakerApp,
  Market, MatchResult, Message, Offer, Order, Payee, Task, Thread, ThreadSummary,
  User, Wallet,
  Withdrawal,
} from './types'

// ── 账户 ──

/** 注册与登录是同一个端点：地址已存在就返回那个账户，不建重复户。 */
export const connect = (body: {
  method: 'passkey' | 'wallet' | 'google' | 'email'
  address?: string
  email?: string
  name?: string
}) => api.post<{
  user: User
  address: string
  /** 后端回传的头名，提醒前端后续请求要带身份。 */
  header: string
  created?: boolean
}>('/auth/connect', body)

export const me = (as?: string) => api.get<User>('/me', { as })

export const wallet = (as?: string) => api.get<Wallet>('/wallet', { as })

// ── 目录 ──

export const assets = () =>
  api.get<{ assets: CatalogAsset[] }>('/catalog/assets').then(r => r.assets)

// ── 池子 ──

/**
 * 浏览池子。
 *
 * **side 是「我想干什么」，不是挂单自身的方向。** 后端 Service.Offers 里
 * 已经做过翻转（intent=buy → 查 side=sell 的挂单），前端不要再翻一次。
 * 这一点从字段名看不出来，是实测出来的——曾经在这里翻反过。
 */
export const offers = (intent: 'buy' | 'sell', asset?: string, fiat?: string) => {
  const q = new URLSearchParams({ side: intent })
  if (asset) q.set('asset', asset)
  if (fiat) q.set('fiat', fiat)
  return api.get<{ offers: Offer[] }>(`/offers?${q}`).then(r => r.offers)
}

export const offer = (id: string) => api.get<Offer>(`/offers/${id}`)

// ── 撮合 ──

/** 先撮合后评估：对手方还没出现时评估无意义。 */
export const match = (body: {
  intent: 'buy' | 'sell'
  amount: string
  amount_kind: 'coin' | 'fiat'
  asset: string
  fiat: string
  counterparty_id?: string
}) => api.post<MatchResult>('/orders/match', body)

export const eligibleCounterparties = (p: {
  side: 'buy' | 'sell'
  asset: string
  fiat: string
  amount: string
  amount_kind: 'coin' | 'fiat'
}) =>
  api.get<{ counterparties: EligiblePeer[] }>(
    `/orders/eligible-counterparties?${new URLSearchParams(p)}`,
  ).then(r => r.counterparties)

// ── 工单 ──

export const orders = (as?: string) =>
  api.get<{ orders: Order[] }>('/orders', { as }).then(r => r.orders ?? [])

export const order = (id: string, as?: string) => api.get<Order>(`/orders/${id}`, { as })

export const tasks = (as?: string) =>
  api.get<{ tasks: Task[] }>('/tasks', { as }).then(r => r.tasks)

/**
 * 吃单。**不需要确认令牌**——吃单只建工单，还没承诺、没动钱。
 * 但事务内会预留可成交量，并发抢不到会拿到 ABOVE_AVAILABLE_QTY。
 */
export const take = (offerId: string, body: {
  amount: string
  amount_kind: 'coin' | 'fiat'
  network: string
  card_id?: string
}) => api.post<Order>(`/offers/${offerId}/take`, body)

/**
 * 承诺点。令牌档位按方向分叉，这个分叉规则封在这里——
 * 记错档位会拿到 SIGNATURE_REQUIRED，而调用方没理由记这条规则。
 *
 * - taker 买币 → commit（对方的币早已锁好，我不出资）
 * - taker 卖币 + 内置钱包 → signature（要签那笔真实的链上转账）
 * - taker 卖币 + 外部钱包 → commit（平台没有该钱包私钥，只能等扫链）
 */
export const accept = (o: Order, via?: 'wallet' | 'external', as?: string) => {
  const sellSide = o.otc?.side === 'sell'
  const grade = sellSide && via !== 'external' ? 'signature' : 'commit'
  return withConfirmation('accept', [o.id], grade,
    token => api.post<Order>(`/orders/${o.id}/accept`, via ? { via } : {}, {
      confirmation: token, as,
    }), as)
}

/** 入金（仅当工单仍欠入金）。签的是那笔链上转账本身，必须签名档。 */
export const fund = (o: Order, via: 'wallet' | 'external', as?: string) =>
  withConfirmation('fund', [o.id, o.amount.asset, o.amount.amount], 'signature',
    token => api.post<Order>(`/orders/${o.id}/fund`, { via }, { confirmation: token, as }), as)

/** 提交法币回执 → s3v。不动链上钱，不需要令牌。 */
export const receipt = (orderId: string, fileRef: string, as?: string) =>
  api.post<Order>(`/orders/${orderId}/receipt`, { file_ref: fileRef }, { as })

/**
 * 核验对方回执 → s4，或 ok=false 转 disputed。
 *
 * 只有**收法币的一方**能核。上传者自核会拿到 NOT_YOUR_CALL——
 * 自己核自己等于退回成「等对方点确认」，那正是协议要取代的东西。
 */
export const verifyReceipt = (orderId: string, ok: boolean, reason = '', as?: string) =>
  api.post<Order>(`/orders/${orderId}/verify-receipt`, { ok, reason }, { as })

export const cancel = (orderId: string, as?: string) =>
  api.post<Order>(`/orders/${orderId}/cancel`, {}, { as })

// ── 上传 ──

/**
 * 上传凭证换一个 file_ref。
 *
 * multipart 表单，字段名必须是 file。不能走 api.post——那一层会设
 * Content-Type: application/json，multipart 的 boundary 就丢了。
 */
export async function upload(file: File, as?: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  // 用同一个 BASE：写死 '/api/v1' 会在跨域部署时漏掉这一个端点
  const res = await fetch(BASE + '/uploads', {
    method: 'POST',
    // 不要手写 Content-Type——boundary 由浏览器生成
    headers: { 'X-Atara-User': as ?? getIdentity() },
    body: fd,
  })
  const body = await res.json().catch(() => null) as
    | { file_ref: string; filename: string; size_bytes: number; url: string }
    | { error: { code: string; message: string } }
    | null
  if (!res.ok || !body || 'error' in body) {
    throw new ApiError(res.status, body && 'error' in body ? body.error : {
      code: 'UPLOAD_FAILED', message: `上传失败（${res.status}）`,
    })
  }
  return body.file_ref
}

// ── 支配权（额度）──

export const allowances = (as?: string) =>
  api.get<{ allowances: Allowance[] }>('/allowances', { as }).then(r => r.allowances ?? [])

export interface AllowanceReq {
  spender: string
  kind: 'person' | 'agent'
  per_payment: string
  window_cap: string
  cycle: 'weekly' | 'monthly'
  /** '30 days' | '90 days' | '' = 不过期 */
  expires: string
  recipients: string
}

/**
 * 签发或改一份额度。**必须签名档**——授予支配权本身就是一次授权动作，
 * 不是一句承诺。
 */
export const saveAllowance = (req: AllowanceReq, id?: string, as?: string) =>
  withConfirmation('allowance', [req.spender, req.per_payment, req.window_cap], 'signature',
    token => api.post<Allowance>(id ? `/allowances/${id}` : '/allowances', req, {
      confirmation: token, as,
    }), as)

export const revokeAllowance = (id: string, as?: string) =>
  api.del<Allowance>(`/allowances/${id}`, { as })

// ── 收款方与提现 ──

export const payees = (as?: string) =>
  api.get<{ payees: Payee[] }>('/payees', { as }).then(r => r.payees ?? [])

export const addPayee = (body: { label: string; chain: string; address: string }, as?: string) =>
  api.post<Payee>('/payees', body, { as })

export const deletePayee = (id: string, as?: string) =>
  api.del<{ status: string }>(`/payees/${id}`, { as })

export const withdrawals = (as?: string) =>
  api.get<{ withdrawals: Withdrawal[] }>('/withdrawals', { as }).then(r => r.withdrawals ?? [])

export interface WithdrawReq {
  payee_id: string
  asset: string
  amount: string
  purpose: string
  doc_upload_id?: string
}

/**
 * 提现。链上转账由你自己签，协议只记意图与合规材料——
 * 但动钱必确认照旧适用，要签名档。只能提数字资产，法币不入账。
 */
export const createWithdrawal = (req: WithdrawReq, as?: string) =>
  withConfirmation('withdraw', [req.payee_id, req.asset, req.amount], 'signature',
    token => api.post<Withdrawal>('/withdrawals', req, { confirmation: token, as }), as)

/** 回填你自己签出来的那笔转账。没有这一步，提现永远停在 submitted。 */
export const broadcastWithdrawal = (id: string, txHash: string, as?: string) =>
  api.post<Withdrawal>(`/withdrawals/${id}/broadcast`, { tx_hash: txHash }, { as })

// ── Discover 与做市准入 ──

export const markets = () =>
  api.get<{ markets: Market[] }>('/discover/markets').then(r => r.markets)

export const makerApp = (as?: string) => api.get<MakerApp>('/maker/application', { as })

export const submitMakerApp = (phase: 'kyc' | 'listing', form: unknown, as?: string) =>
  api.post<MakerApp>('/maker/application', { phase, form }, { as })

/** 待审列表。需要 reviewer 角色，否则 403 ROLE_REQUIRED。 */
export const pendingMakerApps = (as?: string) =>
  api.get<{ applications: MakerApp[] }>('/admin/maker/applications', { as })
    .then(r => r.applications ?? [])

/** 真人审核。审核不算 agent 共识，所以挡在角色门后，系统不自动放行。 */
export const reviewMakerApp = (
  userId: string,
  body: { stage: 'kyc' | 'listing'; decision: 'approve' | 'reject'; reason?: string },
  as?: string,
) => api.post<MakerApp>(`/admin/maker/applications/${userId}/review`, body, { as })

/** 挂单。卖单会真的上链锁币，所以要签名档；买单只是承诺，commit 档即可。 */
export const createOffer = (req: {
  side: 'buy' | 'sell'
  asset: string
  fiat: string
  unit_price: string
  qty: string
  min_lot: string
  network: string
  networks?: string[]
}, as?: string) =>
  withConfirmation('offer', [req.asset, req.qty],
    req.side === 'sell' ? 'signature' : 'commit',
    token => api.post<Offer>('/offers', req, { confirmation: token, as }), as)

export const myOffers = (as?: string) =>
  api.get<{ offers: Offer[] }>('/offers/mine', { as }).then(r => r.offers ?? [])

export const delistOffer = (id: string, as?: string) =>
  api.del<{ status: string }>(`/offers/${id}`, { as })

// ── 联系人与会话 ──

export const contacts = (as?: string) =>
  api.get<{ contacts: Contact[]; relationships: string[] }>('/contacts', { as })

/** 一个字段收名字或地址——没有 ATR ID 这套东西。字段名是 query，不是 q。 */
export const addContact = (
  body: { query: string; label?: string; nickname?: string },
  as?: string,
) => api.post<Contact>('/contacts', body, { as })

export const threads = (as?: string) =>
  api.get<{ threads: ThreadSummary[] }>('/threads', { as }).then(r => r.threads ?? [])

export const thread = (peer: string, as?: string) =>
  api.get<Thread>(`/threads/${encodeURIComponent(peer)}`, { as })

export const postChat = (peer: string, body: string, as?: string) =>
  api.post<Message>(`/threads/${encodeURIComponent(peer)}/messages`, { body }, { as })

// ── 条件支付 ──

export const conditionCatalog = () => api.get<ConditionCatalog>('/catalog/conditions')

/** 自然语言解析成条件原子。V1 前端不用，端点仍在。 */
export const parseIntent = (text: string, as?: string) =>
  api.post<unknown>('/orders/parse', { text }, { as })
