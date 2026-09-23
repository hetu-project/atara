import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import { AUTH_CHANGED, PROFILE_CHANGED } from '../api/client'
import type { User } from '../api/types'

/**
 * The current account, **fetched once for the whole app**.
 *
 * Why not a useApi per component: a single conversation holds fourteen ticket cards, and every card
 * wants to know whether this person uses a custodial or an external wallet -- which is a property of
 * the **person**, not of the order. Each asking separately means fourteen identical requests (doubled
 * again under StrictMode's double mount in dev), while the browser opens only six connections per
 * origin and the SSE stream permanently holds one. So they queue, and the one request that actually
 * matters -- the conversation itself -- gets pushed out to two and a half seconds.
 *
 * The backend answers in a few milliseconds. None of this was ever the backend being slow.
 *
 * The cache lives in the module rather than in a context, because it spans routes and component trees
 * and standalone pages (/order/:id) need it too. Invalidated on identity switch or profile edit:
 * address and wallet type both change, and a stale answer makes the UI reason about the previous
 * account's properties.
 */

let cached: User | null = null
let inflight: Promise<User> | null = null
const subs = new Set<(u: User | null) => void>()

function load(): Promise<User> {
  /* Only one request in flight at a time. When fourteen cards mount at once they all get the same
     promise, and this is exactly where 14 requests collapse into 1. */
  if (!inflight) {
    inflight = ep.me()
      .then(u => {
        cached = u
        subs.forEach(f => f(u))
        return u
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

function invalidate() {
  cached = null
  // Refetch immediately if anyone is still watching; if nobody is, let the next subscriber fetch it.
  if (subs.size) void load().catch(() => {})
  else subs.forEach(f => f(null))
}

addEventListener(AUTH_CHANGED, invalidate)
addEventListener(PROFILE_CHANGED, invalidate)

/** The current account. The first caller triggers the request, the rest await the same one. */
export function useMe(): User | null {
  const [u, setU] = useState<User | null>(cached)

  useEffect(() => {
    subs.add(setU)
    if (cached) setU(cached)
    else void load().catch(() => { /* failure means null; callers handle their own fallback */ })
    return () => { subs.delete(setU) }
  }, [])

  return u
}
