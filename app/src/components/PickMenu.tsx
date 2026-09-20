import { useEffect, useLayoutEffect, useRef } from 'react'
import { avHue, avInit } from './Avatar'

export interface PickItem {
  v: string
  n: string           // 主行，纯文本。用户填的名字会出现在这里，所以它永远不是 HTML
  av?: string         // 主行前面画一个头像，传名字；头像由这里生成，不由调用方拼字符串
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
