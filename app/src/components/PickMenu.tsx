import { useEffect, useLayoutEffect, useRef } from 'react'

export interface PickItem {
  v: string
  n: string           // 主行，允许内嵌头像的 HTML
  d?: string          // 副行：为什么选它。不可用的项要写清为什么，不是单纯置灰让人猜
  off?: boolean
}

/**
 * 胶囊上的下拉，与 console.html 的 pickMenu 同构（#astrip.ddmenu > .asopt）。
 *
 * 挂进句子容器、用 offset 局部定位——不碰视口坐标：
 * 视口测量在无头环境里给过假数据，局部偏移不会。
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
    const t = setTimeout(() => addEventListener('mousedown', away), 0)
    addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      removeEventListener('mousedown', away)
      removeEventListener('keydown', key)
    }
  }, [anchor, onClose])

  return (
    <div className="ddmenu" id="astrip" ref={ref}>
      {items.map(it => (
        <button key={it.v} className="asopt" disabled={it.off}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onPick(it.v); onClose() }}>
          <b dangerouslySetInnerHTML={{ __html: it.n }} />
          {it.d ? <em>{it.d}</em> : null}
        </button>
      ))}
    </div>
  )
}
