import { useEffect, useRef, useState } from 'react'

/**
 * 全局提示气泡，接管原生 `title`，也接管 `.info` 上的 `data-tip`。
 *
 * 原生 title 有三个毛病：停上去约一秒才出、样式由操作系统画（和界面完全两套）、
 * 触屏上根本不出。项目里有 41 处在用它。
 *
 * 做法是**不改那 41 个调用点**：在指上去的瞬间把 title 摘下来存着，离开时
 * 原样还回去。这样静止时 title 仍在 DOM 里——它对那 17 个没有 aria-label 的
 * 图标按钮来说是唯一的无障碍名，摘掉就等于让读屏软件念不出那颗按钮是干什么的。
 *
 * 代价是这套要在悬停时改 DOM 属性，看着有点野。替代方案是把 41 处
 * `title=` 全改成 `data-tip=` 并逐个补 aria-label——改动面大得多，而且
 * 给本来就有可见文字的元素补 aria-label 会覆盖掉那段文字作为无障碍名，
 * 读屏念出来的和屏幕上写的会对不上。
 *
 * `data-tip` 是另一路：console.html 用全局 `.info-pop` 读它。React 抄了
 * 属性和 `.info-pop` 样式，没把那段 JS 搬过来，所以 Account 上的小 i
 * 悬停一直是空的。这里并进同一套气泡，不再单独养一层。
 */

/* 出现前的停顿。原生大约一秒；120ms 已经足够滤掉「鼠标划过去」，
   又不会让人觉得要等。 */
const DELAY = 120
/* 气泡和元素之间留的空。太贴会看不出它指着谁。 */
const GAP = 8

interface Show {
  text: string
  x: number
  y: number
  /** 放在元素上方还是下方——顶部空间不够时翻到下面。 */
  below: boolean
}

export default function Tooltip() {
  const [show, setShow] = useState<Show | null>(null)
  const timer = useRef(0)
  /* 当前被摘掉 title 的那个元素。离开时要还回去，所以得记着。 */
  const held = useRef<{ el: Element; title: string } | null>(null)
  const bubble = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const restore = () => {
      const h = held.current
      if (h) {
        if (h.title) h.el.setAttribute('title', h.title)
        held.current = null
      }
    }
    const hide = () => {
      clearTimeout(timer.current)
      restore()
      setShow(null)
    }

    const enter = (e: Event) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const el = t.closest('[data-tip], [title]')
      if (!el || el === held.current?.el) return
      /* data-tip 是故意写长说明的（Account 小 i）；title 是短标签。
         两者都有时认 data-tip，避免短 title 把长说明盖掉。 */
      const text = el.getAttribute('data-tip') || el.getAttribute('title')
      if (!text) return

      hide()
      const native = el.getAttribute('title')
      if (native) {
        /* 先摘下来：不摘的话浏览器过一秒还会把自己那个灰框叠上来。 */
        el.removeAttribute('title')
        held.current = { el, title: native }
      } else {
        held.current = { el, title: '' }
      }

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect()
        /* 上方放不下就翻到下面。不翻的话贴在顶栏上的按钮，
           气泡会被裁在视口外，等于没有。 */
        const below = r.top < 56
        setShow({
          text,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(below ? r.bottom + GAP : r.top - GAP),
          below,
        })
      }, DELAY) as unknown as number
    }

    document.addEventListener('mouseover', enter, true)
    document.addEventListener('mouseout', hide, true)
    /* 键盘走到的元素也要出提示——只认鼠标的话，用 Tab 的人永远看不到它。 */
    document.addEventListener('focusin', enter, true)
    document.addEventListener('focusout', hide, true)
    /* 滚动和按键时收起：位置是按当时的 rect 算死的，页面一动它就指错地方。 */
    addEventListener('scroll', hide, true)
    addEventListener('keydown', hide, true)
    return () => {
      hide()
      document.removeEventListener('mouseover', enter, true)
      document.removeEventListener('mouseout', hide, true)
      document.removeEventListener('focusin', enter, true)
      document.removeEventListener('focusout', hide, true)
      removeEventListener('scroll', hide, true)
      removeEventListener('keydown', hide, true)
    }
  }, [])

  /* 贴边时横向收一下，免得被视口裁掉。要等气泡渲染出来才知道它多宽，
     所以在这里量完再调。 */
  useEffect(() => {
    const b = bubble.current
    if (!show || !b) return
    const r = b.getBoundingClientRect()
    const over = r.right - (innerWidth - 8)
    const under = 8 - r.left
    if (over > 0) b.style.transform = `translate(calc(-50% - ${Math.ceil(over)}px), ${show.below ? '0' : '-100%'})`
    else if (under > 0) b.style.transform = `translate(calc(-50% + ${Math.ceil(under)}px), ${show.below ? '0' : '-100%'})`
  }, [show])

  if (!show) return null
  return (
    <div ref={bubble}
      className={'tip' + (show.below ? ' below' : '') + (show.text.length > 60 ? ' long' : '')}
      role="tooltip"
      style={{ left: show.x, top: show.y }}>
      {show.text}
    </div>
  )
}
