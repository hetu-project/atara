import { BASE, ApiError, devHeaders, readAuthToken } from './client'
import type { ApiErrorBody } from './types'

/**
 * The Atara AI desk: send a sentence, get the answer back in pieces.
 *
 * Why not EventSource: it can only issue GET and cannot carry custom headers, whereas we need to
 * POST a sentence and send X-Atara-User. So we take the ReadableStream from fetch and parse SSE
 * ourselves -- the protocol is simple enough: an `event:` line, a `data:` line, blank line between records.
 */

/* Account id of the desk. The backend's store.DeskID is the same value -- it is a real user that
   foreign keys point at, not a special-case marker invented by the frontend. */
export const DESK_ID = 'user-desk'

export interface DeskInfo {
  peer_id: string
  name: string
  subtitle: string
  /** Whether this server has a model configured. Without one it still accepts messages, but replies with fixed copy. */
  configured: boolean
}

export interface DeskHandlers {
  /** The next chunk of the answer. */
  onDelta: (text: string) => void
  /** The whole answer has been stored. thought_ms is what the backend measured as "how long before
      the first character", the same number that was persisted -- so it reads the same before and after a refresh. */
  onDone?: (m: { id: string; body: string; created_at: string; thought_ms?: number }) => void
}

/**
 * The error shape matches everywhere else: it carries a code, and callers branch on the code.
 *
 * Note that errors here have two sources and **both arrive with HTTP status 200**: once the
 * connection is established the headers have already gone out, so the backend can only push a
 * failure down as an event. Do not look at the status code.
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
  const headers: Record<string, string> = devHeaders(as)
  const token = await readAuthToken()
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

/**
 * Send a sentence and call back as chunks arrive.
 *
 * Pass a signal to cancel midway (the user navigated away, or sent another line). On cancel the
 * backend stops asking the model for tokens -- every chunk costs money, and tokens nobody will
 * read should not keep being generated.
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

  /* When the connection never got established (400/500) the backend returns the regular error envelope, not a stream. */
  if (!res.ok || !res.body) {
    let err: ApiErrorBody | undefined
    try {
      err = ((await res.json()) as { error?: ApiErrorBody }).error
    } catch { /* not JSON, fall back to the status code */ }
    if (err) throw new ApiError(res.status, err)
    throw new DeskError('DESK_UNREACHABLE', `The desk did not answer (${res.status})`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  /* The try/finally is required: dispatch throws on an error event, and without releasing the reader
     this connection stays open, leaving the backend believing someone is still listening. */
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })

      /* Split on blank lines. **Only complete records are processed** -- the network will split one
         event across two chunks, and without keeping the tail the JSON breaks mid-way, parsing
         fails, and that chunk of text is lost. */
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
