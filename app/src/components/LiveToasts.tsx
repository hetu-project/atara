import { useEffect, useRef } from 'react'
import { LIVE_EVENT, type LivePayload } from '../api/events'
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
    addEventListener(LIVE_EVENT, on)
    return () => removeEventListener(LIVE_EVENT, on)
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
