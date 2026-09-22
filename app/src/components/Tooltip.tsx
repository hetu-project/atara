import { useEffect, useRef, useState } from 'react'

/**
 * Global tooltip bubble, taking over both the native `title` and `data-tip` on `.info`.
 *
 * The native title has three problems: it takes about a second to appear, it is drawn by the
 * operating system (a completely different look from the UI), and it never appears on touch
 * screens. 41 places in this project use it.
 *
 * The approach is to **leave those 41 call sites alone**: lift the title off at the moment of
 * hover, keep it, and put it back on leave. That way the title is still in the DOM at rest --
 * for the 17 icon buttons with no aria-label it is the only accessible name they have, and
 * removing it would leave a screen reader unable to say what the button does.
 *
 * The cost is that this mutates DOM attributes on hover, which looks a bit feral. The alternative
 * is to change all 41 `title=` to `data-tip=` and add an aria-label to each -- a far larger
 * change, and adding aria-label to elements that already have visible text overrides that text as
 * the accessible name, so what the screen reader says stops matching what is on screen.
 *
 * `data-tip` is the other path: console.html reads it with a global `.info-pop`. React copied the
 * attribute and the `.info-pop` styles but never brought that JS across, so the little i on
 * Account has been hovering empty ever since. It is merged into the same bubble here rather than
 * kept as a separate layer.
 */

/* The pause before it appears. The native one is about a second; 120ms is already enough to filter
   out "the mouse passed over it" without feeling like a wait. */
const DELAY = 120
/* The gap left between bubble and element. Too close and you cannot tell what it points at. */
const GAP = 8

interface Show {
  text: string
  x: number
  y: number
  /** Above or below the element -- flips below when there is not enough room at the top. */
  below: boolean
}

export default function Tooltip() {
  const [show, setShow] = useState<Show | null>(null)
  const timer = useRef(0)
  /* The element whose title is currently lifted. It has to be given back on leave, so it is remembered. */
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
      /* data-tip is deliberately a long explanation (the little i on Account); title is a short label.
         When both exist, data-tip wins, so a short title does not mask a long explanation. */
      const text = el.getAttribute('data-tip') || el.getAttribute('title')
      if (!text) return

      hide()
      const native = el.getAttribute('title')
      if (native) {
        /* Lift it off first: without that the browser still stacks its own grey box on top a second later. */
        el.removeAttribute('title')
        held.current = { el, title: native }
      } else {
        held.current = { el, title: '' }
      }

      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect()
        /* Flip below when it does not fit above. Without the flip, a button pinned to the top bar gets
           its bubble clipped outside the viewport, which amounts to having none. */
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
    /* Elements reached by keyboard get a tooltip too -- mouse-only means people using Tab never see it. */
    document.addEventListener('focusin', enter, true)
    document.addEventListener('focusout', hide, true)
    /* Dismiss on scroll and keypress: the position is computed from the rect at the time, so any page movement makes it point at the wrong thing. */
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

  /* Pull it in horizontally near an edge so it is not clipped by the viewport. Its width is only known
     once the bubble has rendered, so measure here and then adjust. */
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
