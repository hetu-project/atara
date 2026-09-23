import { useEffect, useState } from 'react'

/* Views map one to one onto the left-hand nav (see console.html's #left).
   home is the default state: start a new order, not some list. */
export type Route =
  | { view: 'home' }
  | { view: 'discover' }
  | { view: 'contacts' }
  | { view: 'payments' }
  | { view: 'account' }
  /* Settings is another mode of the account page, not another page -- the reference's
     openAcct('settings') just switches ACCT_MODE on the same view. It gets its own route so it
     can be linked to directly and survives a refresh. */
  | { view: 'settings' }
  | { view: 'order'; id: string }
  | { view: 'thread'; peer: string }

/**
 * Hash routing. Survives a refresh, the browser back button works, tickets can be deep-linked and shared.
 * No react-router -- there are only four paths, and one hashchange listener is enough.
 */
export function useRoute() {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return { route, go }
}

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [head, id] = h.split('/')
  if (head === 'order' && id) return { view: 'order', id }
  if (head === 'thread' && id) return { view: 'thread', peer: decodeURIComponent(id) }
  if (head === 'discover') return { view: 'discover' }
  if (head === 'contacts') return { view: 'contacts' }
  if (head === 'payments') return { view: 'payments' }
  if (head === 'account') return { view: 'account' }
  if (head === 'settings') return { view: 'settings' }
  return { view: 'home' }
}

/**
 * Signal for "open a fresh desk".
 *
 * go({view:'home'}) alone is not enough: when someone is already on the home page and clicks New
 * order, the route does not change, Home does not remount, and the assessment and matching cards
 * left over from the previous order stay on screen. So that sidebar click has to shout "start
 * over" explicitly on top of switching routes.
 */
export const NEW_ORDER = 'atara:new-order'

/**
 * Signal for "open the Atara AI conversation".
 *
 * A pair with NEW_ORDER: both entry points land on #/home, the route cannot tell them apart, so
 * each has to shout for itself. New order collapses the existing conversation and opens a fresh
 * desk, while Atara AI under Chats expands it back -- only the screen was collapsed, the
 * server-side history was there all along.
 */
export const OPEN_DESK = 'atara:open-desk'

/* Whether to expand that conversation on entering the home page.
 *
 * A module variable rather than React state: both entry points have to state their intent while
 * Home is **not yet mounted** -- clicking New order from another view fires the event at a moment
 * when the home page does not exist and no listener can receive it. The event solves the "already
 * on the home page" half; this variable solves the other half. */
let deskOpen = false
export const setDeskOpen = (v: boolean): void => { deskOpen = v }
export const isDeskOpen = (): boolean => deskOpen

export function go(r: Route): void {
  location.hash =
    r.view === 'order' ? `/order/${r.id}`
    : r.view === 'thread' ? `/thread/${encodeURIComponent(r.peer)}`
    : `/${r.view}`
}
