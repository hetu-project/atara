import { useEffect, useLayoutEffect, useRef } from 'react'
import { avHue, avInit } from './Avatar'

export interface PickItem {
  v: string
  n: string           // Main row, plain text. User-supplied names land here, so it is never HTML
  av?: string         // Draw an avatar before the main row; pass the name -- the avatar is generated here, not string-built by the caller
  d?: string          // Sub row: why pick it. Unavailable items must say why rather than just greying out and leaving people to guess
  off?: boolean
}

/**
 * Dropdown on a pill, isomorphic with console.html's pickMenu (#astrip.ddmenu > .asopt).
 *
 * Mounted into the sentence container and positioned locally via offset -- viewport
 * coordinates are never touched: viewport measurement has returned bogus data in
 * headless environments, local offsets do not.
 */
export default function PickMenu({
  anchor, items, onPick, onClose,
}: {
  anchor: HTMLElement | null
  items: PickItem[]
  onPick: (v: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const m = ref.current
    const bar = m?.parentElement
    if (!m || !bar || !anchor) return
    const mw = m.offsetWidth || 240
    m.style.left = `${Math.min(anchor.offsetLeft, Math.max(0, bar.clientWidth - mw - 4))}px`
    m.style.top = `${anchor.offsetTop + anchor.offsetHeight + 6}px`
  }, [anchor, items])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && e.target !== anchor) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const t = setTimeout(() => addEventListener('pointerdown', away), 0)
    addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', key)
    }
  }, [anchor, onClose])

  return (
    <div className="ddmenu" id="astrip" ref={ref}>
      {items.map(it => (
        <button key={it.v} className="asopt" disabled={it.off}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onPick(it.v); onClose() }}>
          {/* Text, never markup. The main line used to be HTML so a caller could
              inline an avatar; the caller was concatenating counterparty display
              names into it, and a display name is typed by another user. That
              is stored XSS with a picker for a delivery vehicle. The avatar is
              now drawn here from the name, and the name is rendered as text. */}
          <b>
            {it.av ? (
              <span className="apav" style={{ background: `hsl(${avHue(it.av)} 42% 34%)`, color: '#fff' }}>
                {avInit(it.av)}
              </span>
            ) : null}
            {it.n}
          </b>
          {it.d ? <em>{it.d}</em> : null}
        </button>
      ))}
    </div>
  )
}
