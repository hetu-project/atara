import type { ApiErrorBody, Confirmation, Grade } from './types'
import { WalletTxError, signatureDeclined } from './walletError'

/**
 * 后端地址。
 *
 * 默认 '/api/v1' 是相对路径——**只在前后端同源时成立**：dev 靠 Vite 代理，
 * 生产靠反向代理把 /api 转给后端。
 *
 * 前后端不同源时（比如前端在 Vercel、后端在别处）必须在构建时给出完整地址：
 *
 *     VITE_API_BASE=https://api.example.com/api/v1 npm run build
 *
 * 那种部署方式要靠后端 CORS 放行前端的域名（ATARA_CORS_ORIGINS）。
 * 相对路径不需要 CORS，是更省事也更安全的那条路——优先用反向代理。
 */
export const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

/** 抛出的错误保留后端的 code / field / remedy，调用方按 code 分支。 */
export class ApiError extends Error {
  readonly code: string
  readonly field?: string
  readonly remedy?: ApiErrorBody['remedy']
  readonly status: number

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.field = body.field
    this.remedy = body.remedy
  }
}

/**
 * 当前身份的**演示用**句柄。

 * 真正的身份是 Privy 的 bearer token，后端只认它。这个句柄只在两种情况下
 * 有意义：本地开发把后端开成 ATARA_DEV_AUTH=1 时，X-Atara-User 头直接注入
 * 身份；以及演示时开两个窗口各带一个 ?as= 同时盯住一笔交易的两侧。
 *
 * 所以它只在 dev 构建里发出去（见 DEV_HEADERS）。生产构建一个字节都不带：
 * 后端反正不认，带着只会让下一个接手的人以为它还有效。
 */
let identity = readIdentity()

/** dev 构建才附带的头。生产构建返回空对象。 */
export function devHeaders(as?: string): Record<string, string> {
  return import.meta.env.DEV ? { 'X-Atara-User': as ?? identity } : {}
}

function readIdentity(): string {
  try {
    return localStorage.getItem('atara-identity') || 'demo'
  } catch {
    return 'demo'
  }
}

export function getIdentity(): string {
  return identity
}

export function setIdentity(handle: string): void {
  identity = handle
  try {
    localStorage.setItem('atara-identity', handle)
  } catch {
    /* 隐身窗口或禁用站点数据：内存里生效就够了 */
  }
}

/**
 * 身份失效时的事件名。
 *
 * 后端重建过库、或者账户被删掉之后，本机存的身份就指向一个不存在的人。
 * 那时每一个轮询都会拿到 401——不处理的话界面会一秒一次地重试到天荒地老，
 * 而屏幕上什么都不说。所以这里把它变成一次可响应的事件：清掉身份、弹登录门。
 */
export const IDENTITY_GONE = 'atara:identity-gone'

/**
 * 自己的账户摘要变了——改名，或者额度增删。
 *
 * 这些数同时出现在好几个地方——左下角的账户位、账户页、菜单里的抬头。
 * 它们各自拉一份 /me 和 /allowances，改完只有发起的那一处会重取，别处要等
 * 下次挂载才更新：左下角会一直显示改名前的样子（新账户那就是一串地址），
 * 额度加了五条那里还写着「0 allowances」——看着像什么都没生效。
 *
 * 广播一次，谁显示谁自己去重取。轮询也能盖住这件事，但改名是用户刚做完
 * 的动作，隔几秒才变跟没变一样让人怀疑。
 */
export const PROFILE_CHANGED = 'atara:profile-changed'

/**
 * Sign-in finished, or sign-out did.
 *
 * Requests that leave while authentication is still settling get a 401, and
 * useApi never retries a fetch that has no poll interval — so a page that
 * mounted a moment too early stays blank for the rest of the session. That is
 * how the sidebar ended up showing an invented name, and how six offer cards
 * ended up with no wallet after a fresh login.
 *
 * Rather than each of those thirty-odd call sites learning to retry, this fires
 * once when the answer to "who is calling" has changed, and useApi refetches.
 */
export const AUTH_CHANGED = 'atara:auth-changed'

/**
 * 一条要给人看的全局提示。这一层是纯函数，够不着 React 的 toast；
 * 发一个事件，LiveToasts 收到后弹到右上角。
 */
export const NOTICE_EVENT = 'atara:notice'
export interface Notice { text: string; kind: 'ok' | 'err' | 'info' }
export function notify(text: string, kind: Notice['kind'] = 'info'): void {
  dispatchEvent(new CustomEvent<Notice>(NOTICE_EVENT, { detail: { text, kind } }))
}

/** Announce that sign-in or sign-out completed. */
export function authChanged(): void {
  dispatchEvent(new CustomEvent(AUTH_CHANGED))
}

export function clearIdentity(): void {
  identity = 'demo'
  try {
    localStorage.removeItem('atara-identity')
    sessionStorage.removeItem('atara-signed')
  } catch {
    /* 同上 */
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** 确认令牌，放进 X-Atara-Confirmation 头。 */
  confirmation?: string
  /** 覆盖本次请求的身份，用于代对手方操作（演示两侧）。 */
  as?: string
  signal?: AbortSignal
}

/* How to get the current Privy access token.
 *
 * A module-level hook rather than a React one, because this file is plain
 * functions called from everywhere — hooks only work inside components, and
 * threading a token through every call site would mean touching every endpoint.
 * PrivyRoot installs the getter once on mount; until it does, requests go out
 * unauthenticated and the backend decides what that is worth. */
let readToken: (() => Promise<string | null>) | null = null

export function setTokenSource(fn: (() => Promise<string | null>) | null): void {
  readToken = fn
}

/** The current token, for callers that build their own request (the event
    stream does, because it needs a long-lived response rather than JSON). */
export async function readAuthToken(): Promise<string | null> {
  if (!readToken) return null
  try { return await readToken() } catch { return null }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  /* Dev builds send the seat header for the two-window demo and the
     ATARA_DEV_AUTH path; production sends nothing the backend would not read. */
  const headers: Record<string, string> = devHeaders(opts.as)
  if (readToken) {
    try {
      const t = await readToken()
      if (t) headers.Authorization = 'Bearer ' + t
    } catch { /* No token is a valid state — signed out, or Privy still waking up. */ }
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.confirmation) headers['X-Atara-Confirmation'] = opts.confirmation

  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, {
        code: 'BAD_RESPONSE',
        message: `${res.status} 返回的不是 JSON：${text.slice(0, 120)}`,
      })
    }
  }

  if (!res.ok) {
    const body = parsed as { error?: ApiErrorBody } | null
    const err = new ApiError(res.status, body?.error ?? {
      code: 'HTTP_' + res.status,
      message: `请求失败（${res.status}）`,
    })
    /* 身份不存在了：这是重试也好不了的错，重试只会把它变成一场 401 风暴。
       清掉身份并广播一次，由 App 退回未登录态。 */
    if (err.code === 'UNKNOWN_ACTOR') {
      clearIdentity()
      dispatchEvent(new CustomEvent(IDENTITY_GONE))
    }
    throw err
  }

  // 后端有一类响应把违规装在 200 的 body 里（撮合的 violation），
  // 那不是 HTTP 错误，交给调用方自己判断，这里不拦。
  return parsed as T
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
}

/* How to get the wallet to sign a message.

   Installed by usePrivyAuth the same way the token getter is: this file is
   plain functions and cannot use hooks. Until it is installed, signature-grade
   confirmations go out unsigned — the backend then refuses them unless it is
   running in dev-auth mode, which is the two-seat demo and has no wallet. */
let signMessage: ((message: string) => Promise<string>) | null = null

export function setMessageSigner(fn: ((message: string) => Promise<string>) | null): void {
  signMessage = fn
}

/**
 * The exact text the wallet signs. The backend recomposes it from the request
 * and recovers the signer, so this must match app/confirm.go byte for byte:
 * one field per line, parts one per line, no trailing newline.
 */
export function confirmMessage(scope: string, parts: string[], grade: Grade, issued: number): string {
  return [
    'Atara confirmation',
    `scope: ${scope}`,
    ...parts.map(p => `part: ${p}`),
    `grade: ${grade}`,
    `issued: ${issued}`,
  ].join('\n')
}

/**
 * 换一枚确认令牌。
 *
 * 令牌绑定 (scope + parts) 的摘要：换了金额或对手方，旧令牌就不认了。
 * 120 秒、一次性。所以**不要缓存复用**——每次动钱前重新签发。
 *
 * 签名档要先让钱包签一段写明这次操作的文字（界面上叫「用 Passkey 签名」，
 * 手势是同一个）。后端拿签名恢复出地址、和账户上的地址比对，对不上不发令牌。
 * 承诺档不签：它只表示「我接受这些条款」，一个活着的会话就够。
 */
export async function assert(
  scope: string,
  parts: string[],
  grade: Grade,
  as?: string,
): Promise<string> {
  const body: Record<string, unknown> = { scope, parts, grade }
  if (grade === 'signature' && !signMessage && await readAuthToken()) {
    /* Signed in, but no signer installed yet — Privy is still waking up. The
       backend would refuse an unsigned request anyway; say why here, in words
       about the wallet rather than the protocol. (No token means the dev seat,
       which the backend lets through unsigned on purpose.) */
    const msg = 'Your wallet is not ready to sign yet — try again in a moment'
    notify(msg, 'err')
    throw new WalletTxError(msg)
  }
  if (grade === 'signature' && signMessage) {
    const issued = Math.floor(Date.now() / 1000)
    body.issued = issued
    try {
      body.signature = await signMessage(confirmMessage(scope, parts, grade, issued))
    } catch (e) {
      /* Declined in the wallet. Say so once, in the corner, then hand callers
         a marked error so their own inline error line stays quiet — the raw
         viem text ("User rejected the request. Details: … Version: viem@…")
         is not something a person should read. */
      const msg = signatureDeclined(e)
      notify(msg, 'err')
      throw new WalletTxError(msg)
    }
  }
  const r = await api.post<Confirmation>('/passkey/assert', body, { as })
  return r.confirmation
}

/**
 * 需要确认的操作，一步完成：先换令牌，再带着它调用。
 *
 * 把这两步封在一起是因为分开写太容易出错——摘要的 parts 必须和目标操作
 * 完全对应，写在两个地方就会漂移。
 */
export async function withConfirmation<T>(
  scope: string,
  parts: string[],
  grade: Grade,
  call: (confirmation: string) => Promise<T>,
  as?: string,
): Promise<T> {
  const token = await assert(scope, parts, grade, as)
  return call(token)
}
