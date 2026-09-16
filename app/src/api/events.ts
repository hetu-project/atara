import { BASE, getIdentity, readAuthToken } from './client'

/**
 * The live stream that tells this browser when to refetch.
 *
 * Built on fetch rather than EventSource. EventSource cannot set headers, and
 * the bearer token has to travel in one — the alternative is a token in the
 * query string, which lands in access logs, browser history and any proxy in
 * between. The cost is that reconnection is ours to write, which is the loop
 * below; desk.ts reads a stream the same way.
 *
 * The stream carries no data of consequence: an event says "something changed",
 * and the hooks refetch through the normal endpoints. So a missed event costs a
 * round trip rather than a wrong screen, and the `sync` the server sends on
 * every connect closes whatever gap a dropped connection opened.
 */

/** Fired when the stream says something changed, and on every (re)connect. */
export const LIVE_CHANGED = 'atara:live-changed'

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

  const announce = () => dispatchEvent(new CustomEvent(LIVE_CHANGED))

  const run = async () => {
    if (stopped) return
    ctrl = new AbortController()
    try {
      const token = await readAuthToken()
      const headers: Record<string, string> = { 'X-Atara-User': getIdentity() }
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
          // Comment lines (": ping") are the heartbeat and carry nothing.
          if (!f.startsWith('event:')) continue
          announce()
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
