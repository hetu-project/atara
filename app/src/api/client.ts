import type { ApiErrorBody, Confirmation, Grade } from './types'
import { clearShared } from './share'
import { WalletTxError, signatureDeclined } from './walletError'

/**
 * Backend address.
 *
 * The default '/api/v1' is a relative path -- **valid only when front and back ends are same-origin**: dev
 * relies on the Vite proxy, production on a reverse proxy forwarding /api to the backend.
 *
 * When they are not same-origin (frontend on Vercel, backend elsewhere, say) a full address must be given at build time:
 *
 *     VITE_API_BASE=https://api.example.com/api/v1 npm run build
 *
 * That deployment relies on the backend's CORS allowing the frontend's domain (ATARA_CORS_ORIGINS).
 * A relative path needs no CORS and is both the simpler and the safer path -- prefer the reverse proxy.
 */
export const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

/** Thrown errors preserve the backend's code / field / remedy; callers branch on the code. */
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
 * The **demo** handle for the current identity.
 *
 * The real identity is Privy's bearer token, which is all the backend recognises. This handle only matters in
 * two cases: local development with the backend started as ATARA_DEV_AUTH=1, where the X-Atara-User header
 * injects the identity directly; and demos where two windows each carry a ?as= to watch both sides of one
 * trade at once.
 *
 * So it is only sent in dev builds (see DEV_HEADERS). Production builds carry not a byte of it: the backend
 * would not honour it anyway, and carrying it would make the next person to pick this up think it still works.
 */
let identity = readIdentity()

/** Headers attached only in dev builds. Returns an empty object in production builds. */
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
    /* Private window or site data disabled: taking effect in memory is enough */
  }
}

/**
 * Event name for an invalidated identity.
 *
 * After the backend rebuilds its database, or the account is deleted, the identity stored locally points at
 * someone who does not exist. Every poll then gets a 401 -- unhandled, the UI retries once a second until the
 * end of time while saying nothing on screen. So this turns it into one actionable event: clear the identity
 * and open the sign-in door.
 */
export const IDENTITY_GONE = 'atara:identity-gone'

/**
 * Own account summary changed -- a rename, or an allowance added or removed.
 *
 * These numbers appear in several places at once -- the account cell at the bottom left, the account page, the
 * heading inside the menu. Each fetches its own /me and /allowances, and after a change only the place that
 * initiated it refetches while the others wait for their next mount: the bottom left keeps showing the
 * pre-rename value (for a new account, a string of address), and after adding five allowances it still says
 * "0 allowances" -- as if nothing had taken effect.
 *
 * Broadcast once, and whoever displays it refetches for themselves. Polling would also cover this, but a
 * rename is an action the user has just performed, and a change arriving seconds later is as unconvincing as no change.
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
 * A global notice meant for the user. This layer is pure functions and cannot reach React's toast;
 * it fires an event, and LiveToasts pops it at the top right on receipt.
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
  /* Whatever the shared layer is holding belonged to the account that is
     leaving. The chain config would survive a sign-out harmlessly, but the
     wallet would not, and a cache that is right most of the time is the kind
     that gets trusted. */
  clearShared()
  try {
    localStorage.removeItem('atara-identity')
    sessionStorage.removeItem('atara-signed')
  } catch {
    /* As above */
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** Confirmation token, placed in the X-Atara-Confirmation header. */
  confirmation?: string
  /** Overrides the identity for this request, for acting on the counterparty's behalf (two-sided demos). */
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
        message: `${res.status} did not return JSON: ${text.slice(0, 120)}`,
      })
    }
  }

  if (!res.ok) {
    const body = parsed as { error?: ApiErrorBody } | null
    const err = new ApiError(res.status, body?.error ?? {
      code: 'HTTP_' + res.status,
      message: `Request failed (${res.status})`,
    })
    /* The identity no longer exists: an error no retry can fix, and retrying only turns it into a 401 storm.
       Clear the identity and broadcast once, letting App fall back to the signed-out state. */
    if (err.code === 'UNKNOWN_ACTOR') {
      clearIdentity()
      dispatchEvent(new CustomEvent(IDENTITY_GONE))
    }
    throw err
  }

  // One class of backend response carries a violation inside a 200 body (matching violations),
  // which is not an HTTP error; that is left for the caller to judge and is not intercepted here.
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
 * Exchange for a confirmation token.
 *
 * The token is bound to a digest of (scope + parts): change the amount or the counterparty and the old token is
 * no longer recognised. 120 seconds, single use. So **do not cache and reuse it** -- reissue before every
 * movement of money.
 *
 * The signature tier requires the wallet to sign a piece of text spelling out this operation first (the UI calls
 * it "sign with passkey"; the gesture is the same). The backend recovers the address from the signature and
 * compares it against the account's address, issuing no token if they do not match.
 * The commitment tier is not signed: it only means "I accept these terms", and a live session is enough.
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
 * An operation requiring confirmation, done in one step: exchange for a token, then call with it.
 *
 * These two steps are wrapped together because writing them apart is too easy to get wrong -- the digest's parts
 * have to correspond exactly to the target operation, and written in two places they drift.
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
