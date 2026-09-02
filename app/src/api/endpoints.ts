import { ApiError, api, getIdentity, withConfirmation } from './client'
import type {
  CatalogAsset, EligiblePeer, MatchResult, Offer, Order, Task, User, Wallet,
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
  const res = await fetch('/api/v1/uploads', {
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
