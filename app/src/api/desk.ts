import { BASE, ApiError, getIdentity, readAuthToken } from './client'
import type { ApiErrorBody } from './types'

/**
 * Atara AI 对话台：发一句话，回答一段一段地到。
 *
 * 为什么不用 EventSource：它只能发 GET，也带不了自定义头，而我们要 POST
 * 一句话、还要带 X-Atara-User。所以用 fetch 拿 ReadableStream 自己解 SSE——
 * 协议本身很简单，`event:` 一行、`data:` 一行、空行分段。
 */

/* 对话台的账号 id。后端 store.DeskID 是同一个值——它是外键指向的真实用户，
   不是一个前端自己编的特例标记。 */
export const DESK_ID = 'user-desk'

export interface DeskInfo {
  peer_id: string
  name: string
  subtitle: string
  /** 这台服务器配了模型没有。没配时它照样收消息，但回的是固定话术。 */
  configured: boolean
}

export interface DeskHandlers {
  /** 回答的下一段。 */
  onDelta: (text: string) => void
  /** 整段存完了。thought_ms 是后端量的「第一个字之前等了多久」，
      和落库的是同一个数——所以刷新前后显示一致。 */
  onDone?: (m: { id: string; body: string; created_at: string; thought_ms?: number }) => void
}

/**
 * 出错的形状和别处一致：带 code，调用方按 code 分支。
 *
 * 注意这里的错误有两个来源，而**它们的 HTTP 状态码都是 200**：连接建立之后
 * 头已经发出去了，后端只能把出错当成一个事件推下来。所以不要看状态码。
 */
export class DeskError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DeskError'
    this.code = code
  }
}

/* Both calls here build their own request, so they also have to attach the
   bearer token themselves — request() in client.ts is what normally does it, and
   these two do not go through it. Without the token the server sees an
   unauthenticated caller and answers "sign in first", which the desk then shows
   as its reply. */
export const deskInfo = async (as?: string): Promise<DeskInfo> => {
  const res = await fetch(BASE + '/desk', { headers: await deskHeaders(as) })
  return res.json() as Promise<DeskInfo>
}

async function deskHeaders(as?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'X-Atara-User': as ?? getIdentity() }
  const token = await readAuthToken()
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

/**
 * 发一句话，边收边回调。
 *
 * signal 传进来就能中途取消（用户切走了、或者又发了一句）。取消时后端会
 * 停止向模型要字——每一段都在花钱，没人看的字不该继续生成。
 */
export async function deskSend(
  body: string,
  h: DeskHandlers,
  as?: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(BASE + '/desk/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await deskHeaders(as)) },
    body: JSON.stringify({ body }),
    signal,
  })

  /* 连接都没建起来（400/500）时后端回的是常规的错误信封，不是流。 */
  if (!res.ok || !res.body) {
    let err: ApiErrorBody | undefined
    try {
      err = ((await res.json()) as { error?: ApiErrorBody }).error
    } catch { /* 不是 JSON 就用状态码兜底 */ }
    if (err) throw new ApiError(res.status, err)
    throw new DeskError('DESK_UNREACHABLE', `The desk did not answer (${res.status})`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  /* try/finally 是必须的：dispatch 遇到 error 事件会抛，不收掉读取器的话
     这条连接会一直挂着，后端那边也就一直以为有人在听。 */
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })

      /* 按空行切段。**只处理完整的段**——网络会把一个事件切成两个 chunk，
         不留着尾巴的话，JSON 会从中间断开，解析失败，那一段字就丢了。 */
      let sep: number
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        dispatch(raw, h)
      }
    }
  } finally {
    void reader.cancel().catch(() => {})
  }
}

function dispatch(raw: string, h: DeskHandlers): void {
  let event = 'message'
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return
  }

  switch (event) {
    case 'delta':
      h.onDelta((parsed as { text: string }).text)
      break
    case 'done':
      h.onDone?.(parsed as { id: string; body: string; created_at: string; thought_ms?: number })
      break
    case 'error': {
      const e = parsed as { code: string; message: string }
      throw new DeskError(e.code, e.message)
    }
  }
}
