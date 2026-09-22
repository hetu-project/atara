import { BASE, devHeaders, readAuthToken } from './client'

/**
 * The live stream that tells this browser when to refetch.
 *
 * Built on fetch rather than EventSource. EventSource cannot set headers, and
 * the bearer token has to travel in one — the alternative is a token in the
 * query string, which lands in access logs, browser history and any proxy in
 * between. The cost is that reconnection is ours to write, which is the loop
 * below; desk.ts reads a stream the same way.
 *
 * An event still means "refetch": the hooks reload through the normal
 * endpoints. A few fields ride along (order id, ref, new state) so a toast
 * can name what moved when the person is looking at something else.
 */

/** Fired when the stream says something changed, and on every (re)connect. */
export const LIVE_CHANGED = 'atara:live-changed'
/** Fired with the parsed payload, except on the reconnect `sync`. */
export const LIVE_EVENT = 'atara:live-event'

export interface LivePayload {
  kind: string
  peer?: string
  order_id?: string
  ref?: string
  state?: string
}

const FIRST_RETRY = 1000
const MAX_RETRY = 30_000

/**
 * Open the stream and keep it open. Returns a function that closes it for good.
 *
 * Reconnects with backoff, because the reasons a stream dies are mostly
 * temporary: a laptop sleeping, a proxy reaping an idle connection, a backend
 * restart. Retrying instantly against a server that is still coming up is how a
 * page full of tabs turns a restart into a stampede.
 */
export function openEventStream(): () => void {
  let stopped = false
  let ctrl: AbortController | null = null
  let timer: number | undefined
  let fails = 0

  const announce = (payload?: LivePayload) => {
    dispatchEvent(new CustomEvent(LIVE_CHANGED))
    if (payload?.kind && payload.kind !== 'sync') {
      dispatchEvent(new CustomEvent<LivePayload>(LIVE_EVENT, { detail: payload }))
    }
  }

  const run = async () => {
    if (stopped) return
    ctrl = new AbortController()
    try {
      const token = await readAuthToken()
      const headers: Record<string, string> = devHeaders()
      if (token) headers.Authorization = 'Bearer ' + token

      const res = await fetch(BASE + '/events', { headers, signal: ctrl.signal })
      if (!res.ok || !res.body) throw new Error(String(res.status))

      /* Connected. Reset the backoff here rather than on the first event: the
         connection itself is the success, and a stream that stays quiet for an
         hour is working perfectly. */
      fails = 0

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        /* SSE frames are separated by a blank line. Anything after the last one
           is a partial frame — keep it for the next chunk rather than parsing
           half an event. */
        const frames = buf.split('\n\n')
        buf = frames.pop() ?? ''
        for (const f of frames) {
          const p = parseFrame(f)
          /* Comment frames (": ping") keep the socket alive and carry nothing. */
          if (!p) continue
          announce(p)
        }
      }
    } catch {
      /* Every failure is the same failure here: reconnect. Distinguishing them
         would only change the message nobody sees. */
    }
    if (stopped) return
    fails += 1
    const wait = Math.min(MAX_RETRY, FIRST_RETRY * 2 ** (fails - 1))
    // Jitter, so a restart does not bring every open tab back at the same instant.
    timer = setTimeout(run, Math.round(wait * (0.7 + Math.random() * 0.6))) as unknown as number
  }

  void run()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    ctrl?.abort()
  }
}

function parseFrame(raw: string): LivePayload | undefined {
  let event = ''
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!event) return
  let extra: LivePayload = { kind: event }
  if (data) {
    /* 展开在前、kind 在后：SSE 的 `event:` 那一行才是「这是什么事件」的
       权威，data 里带的是 peer / order_id 这些附加信息。反过来写的话，
       data 里若出现一个 kind 就会把 event 行盖掉——而那一行是我们自己
       发的，data 是从 JSON 解出来的。 */
    try { extra = { ...(JSON.parse(data) as Partial<LivePayload>), kind: event } }
    catch { /* a malformed frame still means "something changed" */ }
  }
  return extra
}
