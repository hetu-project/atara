import { useEffect, useRef } from 'react'
import { LIVE_EVENT, type LivePayload } from '../api/events'
import { NOTICE_EVENT, type Notice } from '../api/client'
import { go, useRoute, type Route } from '../hooks/useRoute'
import { useToast } from './Toast'

/**
 * Toasts for things that moved while the person was looking elsewhere.
 *
 * The order page and the thread already show the same facts. Repeating them
 * in the corner would be a second mouth. Skip those two surfaces; everywhere
 * else, name the order and offer a View.
 */
export default function LiveToasts() {
  const { toast } = useToast()
  const { route } = useRoute()
  const routeRef = useRef(route)
  routeRef.current = route

  useEffect(() => {
    const on = (e: Event) => {
      const ev = (e as CustomEvent<LivePayload>).detail
      if (!ev) return
      if (watching(routeRef.current, ev)) return
      const hit = copy(ev)
      if (!hit) return
      toast(hit.text, {
        kind: hit.kind,
        action: hit.go
          ? { label: 'View', onClick: hit.go }
          : undefined,
      })
    }
    /* Plain notices from the API layer (a declined signature, for one): no
       route check, no View button — they are about what the person just did. */
    const onNotice = (e: Event) => {
      const n = (e as CustomEvent<Notice>).detail
      if (n?.text) toast(n.text, { kind: n.kind })
    }
    addEventListener(LIVE_EVENT, on)
    addEventListener(NOTICE_EVENT, onNotice)
    return () => { removeEventListener(LIVE_EVENT, on); removeEventListener(NOTICE_EVENT, onNotice) }
  }, [toast])

  return null
}

function watching(route: Route, ev: LivePayload): boolean {
  if (ev.kind === 'order') {
    if (route.view === 'order' && ev.order_id && route.id === ev.order_id) return true
    if (route.view === 'thread' && ev.peer && route.peer === ev.peer) return true
  }
  /* The maker card lives in the home thread. The card itself will move. */
  if (ev.kind === 'maker' && route.view === 'home') return true
  /* Same card, same reason: the strip naming the stranded lock appears on it. */
  if (ev.kind === 'lock' && route.view === 'home') return true
  return false
}

function copy(ev: LivePayload): { text: string; kind: 'ok' | 'err' | 'info'; go?: () => void } | null {
  const ref = ev.ref || 'an order'
  const open = ev.order_id
    ? () => go({ view: 'order', id: ev.order_id! })
    : ev.kind === 'maker'
      ? () => go({ view: 'home' })
      : undefined

  if (ev.kind === 'order') {
    switch (ev.state) {
      case 's3':
      case 'locked':
        return { text: `Escrow funded · ${ref}`, kind: 'ok', go: open }
      case 's3v':
        return { text: `Receipt uploaded · ${ref}`, kind: 'info', go: open }
      case 's5':
      case 'released':
        return { text: `Escrow released · ${ref}`, kind: 'ok', go: open }
      case 'expired':
        return { text: `Payment window missed · coins returned · ${ref}`, kind: 'err', go: open }
      case 'cancelled':
        return { text: `Order cancelled · ${ref}`, kind: 'info', go: open }
      case 'disputed':
        return { text: `Dispute opened on ${ref}`, kind: 'err', go: open }
      default:
        return null
    }
  }

  /* Coins in escrow with no listing on them.

     The one thing here that is about something the person tried to do and
     believes failed: the wallet locked the coins, the listing never went up,
     and the card said "Could not post". So this is not "something moved while
     you were away" — it is "that thing you gave up on is recoverable, and the
     coins were never at risk". It leads back to the listing card, where the
     button to post it lives; posting is still their click, never ours. */
  if (ev.kind === 'lock') {
    return {
      text: 'Coins locked in escrow with no listing — post it when you are ready',
      kind: 'info',
      go: () => go({ view: 'home' }),
    }
  }

  if (ev.kind === 'maker') {
    switch (ev.state) {
      case 'kyc_ok':
        return { text: 'Identity approved — you can trade now', kind: 'ok', go: open }
      case 'listing_ok':
        return { text: 'Trading terms approved — you can post listings now', kind: 'ok', go: open }
      case 'kyc_reject':
        return { text: 'Identity needs revision', kind: 'err', go: open }
      case 'listing_reject':
        return { text: 'Trading terms need revision', kind: 'err', go: open }
      default:
        return null
    }
  }
  return null
}
