import type { ApiErrorBody, Confirmation, Grade } from './types'

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
 * 当前身份。后端鉴权是 mock——X-Atara-User 头直接注入身份，没有会话。
 * 演示一笔交易的两侧必须能切身份，所以这个值是可写的，存在 localStorage 里。
 */
let identity = readIdentity()

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

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Atara-User': opts.as ?? identity,
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

/**
 * 换一枚确认令牌。
 *
 * 令牌绑定 (scope + parts) 的摘要：换了金额或对手方，旧令牌就不认了。
 * 120 秒、一次性。所以**不要缓存复用**——每次动钱前重新签发。
 */
export async function assert(
  scope: string,
  parts: string[],
  grade: Grade,
  as?: string,
): Promise<string> {
  const r = await api.post<Confirmation>('/passkey/assert', { scope, parts, grade }, { as })
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
