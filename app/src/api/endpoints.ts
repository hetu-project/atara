import { ApiError, BASE, PROFILE_CHANGED, api, assert, getIdentity, readAuthToken, withConfirmation } from './client'
import type {
  Account, Allowance, ApiErrorBody, Assessment, BankAccount, CatalogAsset, ChainInfo, PreparedOffer, ConditionCatalog, Contact, DepositStatus, EligiblePeer, KybResult, KycSession, KycStatus, MakerApp, Market, MatchResult, Message, Offer, Order, Payee, RailGroup, Task, Thread, ThreadSummary, User, Wallet, Withdrawal,
} from './types'

// ── 账户 ──

/**
 * Sign-up and sign-in are the same endpoint: the account is looked up by
 * `privy_id`, so the same person always lands on the same account whether or
 * not this particular login came with a wallet.
 */
export const connect = (body: {
  method: 'passkey' | 'wallet' | 'google' | 'email' | 'twitter'
  /** The identity. Everything else on this object can change; this cannot. */
  privy_id?: string
  /** Where money goes. Absent while Privy is still provisioning the wallet —
      the account is created either way and refuses payments until it lands. */
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

/** 改展示名。地址才是账户的唯一键，所以改名不动任何已有关系。 */
export const rename = async (displayName: string, as?: string) => {
  const u = await api.post<User>('/me', { display_name: displayName }, { as })
  // 别处显示这个名字的地方自己去重取——见 PROFILE_CHANGED。
  dispatchEvent(new CustomEvent(PROFILE_CHANGED))
  return u
}

export const wallet = (as?: string) => api.get<Wallet>('/wallet', { as })

// ── 目录 ──

export const assets = () =>
  api.get<{ assets: CatalogAsset[] }>('/catalog/assets').then(r => r.assets)

/** 结算法币，按走廊分组。目录只发这一版支持的——范围由后端声明。 */
/** 链上合约地址。mock 下回一份空的，前端据此知道这一版不发交易。 */
export const chainInfo = () => api.get<ChainInfo>('/catalog/chain')

/**
 * 法币收款渠道。**必须问后端,不能在前端写死。**
 *
 * 写死那一版列了 SGD / AED / EUR 三档,而后端只结算 CNY / HKD / USD。
 * 只勾了 SGD 的商户配置照样审过,然后永远撮合不到单——他收不到任何报错,
 * 只是没有生意。目录归后端,这一整类问题才不会再出现。
 */
export const rails = () =>
  api.get<{ groups: RailGroup[] }>('/catalog/rails').then(r => r.groups ?? [])

export const fiats = () =>
  api.get<{ corridors: { group: string; assets: CatalogAsset[] }[] }>('/catalog/fiats')
    .then(r => r.corridors)

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

/** 对手方风控共识。票与结论都来自后端——前端再编一份，两边就会各说各的。 */
export const assessment = (offerId: string) =>
  api.get<Assessment>(`/offers/${offerId}/assessment`)

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
/* 一次交齐。一笔转账常常不止一张——付款页、银行回单、附言看不清时还要
   一条流水。分多次提交的话订单会被推进去好几次,而它只该推进一次。 */
export const receipt = (orderId: string, fileRefs: string[], as?: string) =>
  api.post<Order>(`/orders/${orderId}/receipt`, { file_refs: fileRefs }, { as })

/**
 * 核验对方回执 → s4，或 ok=false 转 disputed。
 *
 * 只有**收法币的一方**能核。上传者自核会拿到 NOT_YOUR_CALL——
 * 自己核自己等于退回成「等对方点确认」，那正是协议要取代的东西。
 */
export const verifyReceipt = (orderId: string, ok: boolean, reason = '', as?: string) =>
  ok
    /* Clearing releases escrow, so it is signature grade — the same passkey
       step as funding. Rejecting only freezes money and needs nothing extra. */
    ? withConfirmation('verify', [orderId], 'signature',
        tok => api.post<Order>(`/orders/${orderId}/verify-receipt`, { ok, reason }, { as, confirmation: tok }), as)
    : api.post<Order>(`/orders/${orderId}/verify-receipt`, { ok, reason }, { as })

/**
 * 开一张争议案卷。
 *
 * 分类和经过都发给后端存进这一单的事件流——收下来才算数。经过是必填的：
 * 案子要交给人看，空的没法看。
 */
export const dispute = (
  orderId: string,
  body: { kind: string; details: string; file_ref?: string },
  as?: string,
) => api.post<Order>(`/orders/${orderId}/dispute`, body, { as })

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
  /* The bearer token has to go on by hand here: request() is what normally
     attaches it, and this call deliberately does not go through it. */
  const headers: Record<string, string> = { 'X-Atara-User': as ?? getIdentity() }
  const token = await readAuthToken()
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch(BASE + '/uploads', {
    method: 'POST',
    // 不要手写 Content-Type——boundary 由浏览器生成
    headers,
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
  /** 这份授权是对哪条链上的哪个代币。不给就是 USDT、后端连着的那条链。 */
  asset?: string
  network?: string
}

/**
 * 签发或改一份额度。**必须签名档**——授予支配权本身就是一次授权动作，
 * 不是一句承诺。
 */
export const saveAllowance = async (req: AllowanceReq, id?: string, as?: string) => {
  const a = await withConfirmation('allowance',
    [req.spender, req.per_payment, req.window_cap], 'signature',
    token => api.post<Allowance>(id ? `/allowances/${id}` : '/allowances', req, {
      confirmation: token, as,
    }), as)
  // 左下角那行「N allowances」也显示这个数——见 PROFILE_CHANGED。
  dispatchEvent(new CustomEvent(PROFILE_CHANGED))
  return a
}

export const revokeAllowance = async (id: string, as?: string) => {
  const a = await api.del<Allowance>(`/allowances/${id}`, { as })
  dispatchEvent(new CustomEvent(PROFILE_CHANGED))
  return a
}

// ── 收款方与提现 ──

// ── 法币收款账户 ──

export const bankAccounts = (as?: string) =>
  api.get<{ accounts: BankAccount[] }>('/bank-accounts', { as }).then(r => r.accounts ?? [])

/** 提交的是**全量**账号：后端校完就掩码落库，全量不进数据库。 */
export const saveBankAccount = (
  body: {
    holder: string; bank: string; account_no: string; currency: string; region: string
    /** ISO alpha-2 of where the bank is; picks the account-number format rules. */
    country?: string
  },
  id?: string, as?: string,
) => api.post<BankAccount>(id ? `/bank-accounts/${id}` : '/bank-accounts', body, { as })

export const deleteBankAccount = (id: string, as?: string) =>
  api.del<{ status: string }>(`/bank-accounts/${id}`, { as })

export const payees = (as?: string) =>
  api.get<{ payees: Payee[] }>('/payees', { as }).then(r => r.payees ?? [])

export const addPayee = (body: { label: string; chain: string; address: string }, as?: string) =>
  api.post<Payee>('/payees', body, { as })

export const deletePayee = (id: string, as?: string) =>
  api.del<{ status: string }>(`/payees/${id}`, { as })

export const withdrawals = (as?: string) =>
  api.get<{ withdrawals: Withdrawal[] }>('/withdrawals', { as }).then(r => r.withdrawals ?? [])

export interface WithdrawReq {
  /** 登记过的收款方。直接打给陌生地址时留空，改给 to_address / to_chain。 */
  payee_id?: string
  to_address?: string
  to_chain?: string
  asset: string
  amount: string
  purpose?: string
  doc_upload_id?: string
}

/**
 * 转账。链上那一笔由你自己的钱包签，协议只记下这次意图——
 * 但动钱必确认照旧适用，要签名档。只能转数字资产，法币不入账。
 */
export const createWithdrawal = (req: WithdrawReq, as?: string) =>
  /* 摘要绑的是目标地址，不是 payee id——直接打给陌生地址时根本没有 id。 */
  withConfirmation('withdraw', [req.to_address ?? '', req.asset, req.amount], 'signature',
    token => api.post<Withdrawal>('/withdrawals', req, { confirmation: token, as }), as)

/** 回填你自己签出来的那笔转账。没有这一步，提现永远停在 submitted。 */
export const broadcastWithdrawal = (id: string, txHash: string, as?: string) =>
  api.post<Withdrawal>(`/withdrawals/${id}/broadcast`, { tx_hash: txHash }, { as })

// ── Discover 与做市准入 ──

export const markets = () =>
  api.get<{ markets: Market[] }>('/discover/markets').then(r => r.markets)

/**
 * 申诉：告诉我们预审判错了。
 *
 * 不重跑模型——同一份材料再问一次多半得到同一个答案，那只会让人以为自己
 * 被敷衍了。申辩是新的信息，读懂它并决定要不要采信，正是一开始就没交给
 * 模型的那类判断。
 */
export const appealMakerApp = (note: string, as?: string) =>
  api.post<MakerApp>('/maker/application/appeal', { note }, { as })


/* 半路自动保存。跟提交是两件事:这个只写草稿列,不碰已提交的那份,
   也不触发任何审核。没配 ATARA_PII_KEY 时后端会回 DRAFT_UNAVAILABLE——
   半填的身份材料不明文落库。 */
/* 核一份企业注册文件。单独一个端点:它按次计费(10 credits)、要等七八秒,
   而提交是个瞬时动作。搭在一起的话,点「下一步」会莫名其妙卡住,而且改一个
   无关字段重新提交就又扣一次。 */
export const verifyBusiness = (fileRef: string, as?: string) =>
  api.post<KybResult>('/maker/kyb', { file_ref: fileRef }, { as })

export const saveMakerDraft = (
  body: { phase: 'kyc' | 'listing'; step: number; form: Record<string, unknown> }, as?: string,
) => api.post<{ status: string }>('/maker/draft', body, { as })
export const makerApp = (as?: string) => api.get<MakerApp>('/maker/application', { as })

// ── 身份核验（ID Analyzer / DocuPass）──
//
// 浏览器这一侧只碰 reference。API key 留在后端——ID Analyzer 自己的文档把
// 这条写成硬规矩：应用绝不可直接调 POST /docupass 或 GET /docupass/{reference}。
// 托管流程跑完时那个 onFinish 也只是「用户点完了」的 UI 信号，不是结论；
// 结论一律回来问 kycStatus，那一份是后端从 webhook 或主动拉取落定的。

/** 开一次核验会话。每条链接单次有效——v3 已经废掉了可复用链接。 */
export const startKyc = (as?: string) => api.post<KycSession>('/kyc/session', {}, { as })

/**
 * 查当前状态。
 *
 * 默认让后端顺手去上游拉一次：本地开发和用内置预设时根本收不到 webhook，
 * 只等回调的话状态会永远停在 pending。列表页那种不关心实时性的地方
 * 传 refresh=false，省一次上游往返。
 */
export const kycStatus = (as?: string, refresh = true) =>
  api.get<KycStatus>('/kyc/status' + (refresh ? '' : '?refresh=0'), { as })

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
}, as?: string, confirmation?: string) =>
  /* A caller that already holds a token passes it in. The sell flow does:
     it has to sign *before* the wallet locks coins on chain, so by the time
     it gets here the confirmation is minutes old and must not be re-issued. */
  confirmation
    ? api.post<Offer>('/offers', req, { confirmation, as })
    : withConfirmation('offer', [req.asset, req.qty],
        req.side === 'sell' ? 'signature' : 'commit',
        token => api.post<Offer>('/offers', req, { confirmation: token, as }), as)

/** The confirmation a sell listing needs, obtainable ahead of the lock. Same
    scope and parts as createOffer, or the backend will not accept it. */
export const confirmOffer = (asset: string, qty: string, as?: string) =>
  assert('offer', [asset, qty], 'signature', as)

/** 挂卖单第一步：要号，并拿到锁币要用的参数。 */
/** 一笔外部入金到账了没有。只有这笔入金的主人查得到。 */
export const depositStatus = (offerID: string, as?: string) =>
  api.get<DepositStatus>(`/offers/${offerID}/deposit`, { as })

export const prepareOffer = (req: {
  side: 'buy' | 'sell'; asset: string; fiat: string; qty: string
  unit_price: string; min_lot: string; network: string
}, as?: string) => api.post<PreparedOffer>('/offers/prepare', req, { as })

/** 下架前要的解锁参数。 */
export const prepareDelist = (id: string, as?: string) =>
  api.post<PreparedOffer>(`/offers/${id}/prepare-delist`, {}, { as })

export const myOffers = (as?: string) =>
  api.get<{ offers: Offer[] }>('/offers/mine', { as }).then(r => r.offers ?? [])

export const delistOffer = (id: string, as?: string) =>
  api.del<{ status: string }>(`/offers/${id}`, { as })

/** 找人加联系人。名字模糊、地址精确——规则在后端一处，前端不再自己推。 */
export const searchAccounts = (q: string, as?: string) =>
  api.get<{ accounts: Account[] }>(
    `/accounts/search?q=${encodeURIComponent(q)}`, { as }).then(r => r.accounts ?? [])

/**
 * 别人发给我、还没点头的联系人请求。
 *
 * 返回的不是 Contact：请求还不是关系，没有成交记录、没有往来净额、
 * 没有「认识多久了」。照 Contact 的形状声明的话，那几个字段在运行时
 * 是 undefined，而类型说它们一定在。
 */
export interface ContactRequest {
  id: string
  address: string
  name: string
  kind: string
  label: string
  nickname?: string
  status: string
}
export const contactRequests = (as?: string) =>
  api.get<{ requests: ContactRequest[] }>('/contact-requests', { as })
    .then(r => r.requests ?? [])

export const acceptContact = (id: string, as?: string) =>
  api.post<{ status: string }>(`/contact-requests/${id}/accept`, {}, { as })

// ── 联系人与会话 ──

export const contacts = (as?: string) =>
  api.get<{ contacts: Contact[]; relationships: string[] }>('/contacts', { as })

/** 一个字段收名字或地址——没有 ATR ID 这套东西。字段名是 query，不是 q。 */
export const addContact = (
  body: { query: string; label?: string; nickname?: string },
  as?: string,
) => api.post<Contact>('/contacts', body, { as })

/**
 * The sidebar feed: one poll, two things on it.
 *
 * `pending_contacts` is how many people are waiting for me to accept them.
 * It rides along with the thread list rather than getting an endpoint of its
 * own because the sidebar already polls this one every three seconds, and a
 * second timer for a single integer is not worth the traffic.
 */
export const threads = (as?: string) =>
  api.get<{ threads: ThreadSummary[]; pending_contacts?: number }>('/threads', { as })
    .then(r => ({ list: r.threads ?? [], pending: r.pending_contacts ?? 0 }))

export const thread = (peer: string, as?: string) =>
  api.get<Thread>(`/threads/${encodeURIComponent(peer)}`, { as })

export const postChat = (peer: string, body: string, as?: string) =>
  api.post<Message>(`/threads/${encodeURIComponent(peer)}/messages`, { body }, { as })

// ── 条件支付 ──

export const conditionCatalog = () => api.get<ConditionCatalog>('/catalog/conditions')

/** 自然语言解析成条件原子。V1 前端不用，端点仍在。 */
export const parseIntent = (text: string, as?: string) =>
  api.post<unknown>('/orders/parse', { text }, { as })

/* 这里原来有一个 fileURL(ref)，前端自己拼 /uploads/<ref>。删掉了：那条路由
   现在要一枚签过名的链接，而链接只能由后端签——它是在「你是不是这单的当事人」
   那一步之后发的。所以 ref 只是文件名，能不能打开由 receipt_url 说了算。 */

// ── 语音听写 ──

/**
 * 换一枚讯飞的鉴权 WSS URL。
 *
 * 签名是短时的（讯飞那边约五分钟），**不要缓存**——每次开录音都重新拿。
 * 密钥只在后端，这里拿到的只是一枚签好的地址。
 */
export const iflytekToken = (as?: string) =>
  api.get<{ url: string; app_id: string }>('/voice/iflytek-token', { as })

// ── Atara AI 对话台 ──

/* 流式收发单独一个模块：它不走 api.post（那个把整段 JSON 读完才返回），
   而是自己解 SSE。这里重新导出，调用方仍然只认 endpoints 一个入口。 */
export { deskSend, deskInfo, DeskError, DESK_ID } from './desk'
export type { DeskInfo, DeskHandlers } from './desk'

/** 后端的单文件上限（`maxUpload = 16 << 20`）。 */
export const MAX_UPLOAD = 16 * 1024 * 1024

export interface Uploaded {
  file_ref: string
  filename: string
  size_bytes: number
  url: string
}

/**
 * 带进度的上传。
 *
 * 用 XHR 不用 fetch：fetch 拿不到上传进度（`duplex: 'half'` 的请求流各家浏览器
 * 支持还不一致）。传一张几 MB 的照片要好几秒，没有进度那几秒里界面是死的。
 *
 * 返回一个可取消的句柄——传到一半改主意是常事，而一个取消不掉的上传会
 * 一直占着连接，还会在完成后把已经不需要的 ref 写回表单。
 */
export function uploadProgress(
  file: File,
  onProgress: (pct: number) => void,
  as?: string,
): { done: Promise<Uploaded>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  let abandoned = false
  let bail: (() => void) | null = null
  const done = new Promise<Uploaded>((resolve, reject) => {
    bail = () => reject(new ApiError(0, { code: 'UPLOAD_ABORTED', message: 'Upload cancelled' }))
    xhr.upload.onprogress = e => {
      /* lengthComputable 为假时别硬算：那时 e.total 是 0，算出来是 Infinity，
         进度条会直接窜到底再卡住，比没有进度更糟。 */
      if (e.lengthComputable && e.total > 0) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* 不是 JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body && 'file_ref' in (body as object)) {
        onProgress(100)
        resolve(body as Uploaded)
        return
      }
      const err = body && typeof body === 'object' && 'error' in body
        ? (body as { error: ApiErrorBody }).error
        : { code: 'UPLOAD_FAILED', message: `Upload failed (${xhr.status})` }
      reject(new ApiError(xhr.status, err))
    }
    /* 网络断了和被取消要分开：前者该提示重传，后者是用户自己的意思，
       报一句「上传失败」只会让人以为出了错。 */
    xhr.onerror = () => reject(new ApiError(0, {
      code: 'UPLOAD_NETWORK', message: 'Lost the connection while uploading',
    }))
    xhr.onabort = () => reject(new ApiError(0, { code: 'UPLOAD_ABORTED', message: 'Upload cancelled' }))
  })

  const fd = new FormData()
  fd.append('file', file)

  /* Reading the token is async, so the request leaves on a later tick while the
     handle we return exists right now. That gap is real: a user who changes
     their mind can abort before anything is in flight, and xhr.abort() on a
     request that was never opened does nothing at all — so abort rejects the
     promise itself and tells the sender not to bother. */
  void (async () => {
    const token = await readAuthToken()
    if (abandoned) return
    xhr.open('POST', BASE + '/uploads')
    xhr.setRequestHeader('X-Atara-User', as ?? getIdentity())
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    // 不设 Content-Type——boundary 由浏览器生成
    xhr.send(fd)
  })()

  return {
    done,
    abort: () => {
      if (abandoned) return
      abandoned = true
      xhr.abort() // Fires onabort once sent; a no-op before that, hence bail.
      bail?.()    // Settling twice is harmless — the first one wins.
    },
  }
}
