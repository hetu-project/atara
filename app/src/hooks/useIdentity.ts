import { useCallback, useState } from 'react'
import { getIdentity, setIdentity } from '../api/client'

const SIGNED = 'atara-signed'

/**
 * Who the interface thinks you are, and whether to open the personal area.
 *
 * This flag is not a security boundary and never was. The credential is the
 * Privy access token that api/client.ts attaches to every request; the backend
 * verifies its signature and resolves it to an account. What is stored here only
 * decides what gets rendered.
 *
 * The X-Atara-User header below is the demo path. The backend ignores it
 * whenever a token is present, and refuses it outright unless ATARA_DEV_AUTH is
 * set — so it cannot override a real identity, and a deployment that never
 * thinks about that setting gets the safe behaviour.
 *
 * **What is still missing.** This comment used to claim "moving money needs a
 * Passkey signature and the backend verifies it". It does not: /passkey/assert
 * issues a confirmation token without checking any WebAuthn assertion, so the
 * signature and commit tiers are a convention the frontend follows rather than
 * something the backend enforces. A valid session is currently enough for every
 * action in the product. The gap is narrower than it was — minting one of those
 * tokens now requires a verified session — but an attacker holding a live token,
 * or anyone at an unlocked screen, is not stopped by the tier they are in.
 * Do not build on the assumption that they are.
 *
 * Switching identity has to stay possible for demos: one order shows
 * complementary phases to its two sides, and two windows with ?as= is how that
 * gets shown. Seeded handles are in SEED_HANDLES.
 */
export function useIdentity() {
  // ?as=<handle> overrides the current identity, writes it to localStorage and counts as signed in.
  // Essential for the demo desk: open two windows each with its own as and you can watch both
  // sides of a trade at once.
  // Dev builds only: in production the backend does not honour this header, so making it
  // "look signed in" would just yield a screen full of 401s.
  const asParam = () => (import.meta.env.DEV ? new URLSearchParams(location.search).get('as') : null)
  const [handle, setHandle] = useState(() => {
    const as = asParam()
    if (as) {
      setIdentity(as)
      try { sessionStorage.setItem(SIGNED, '1') } catch { /* private window */ }
      return as
    }
    return getIdentity()
  })
  const [signed, setSigned] = useState(() => {
    if (asParam()) return true
    try { return sessionStorage.getItem(SIGNED) === '1' } catch { return false }
  })

  const change = useCallback((h: string) => {
    setIdentity(h)
    setHandle(h)
  }, [])

  /** Sign-in: remember the identity and open the personal pane. */
  const signIn = useCallback((h: string) => {
    setIdentity(h)
    setHandle(h)
    try { sessionStorage.setItem(SIGNED, '1') } catch { /* private window */ }
    setSigned(true)
  }, [])

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(SIGNED) } catch { /* private window */ }
    setSigned(false)
  }, [])

  return { handle, signed, change, signIn, signOut }
}

/** Identities in the seed data. UserByHandle also matches on display_name. */
export const SEED_HANDLES = [
  { handle: 'demo', label: 'Demo (you)' },
  { handle: 'CrabWalk Trading', label: 'CrabWalk Trading (maker · sells USDT/CNY)' },
  { handle: 'Lotus Capital', label: 'Lotus Capital (maker · buys USDT/CNY)' },
  { handle: 'Golden Gate', label: 'Golden Gate (maker)' },
  { handle: 'reviewer', label: 'Reviewer (arbiter)' },
]
