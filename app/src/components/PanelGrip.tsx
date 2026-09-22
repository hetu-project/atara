import { useCallback, useEffect, useRef } from 'react'

/**
 * The drag handle on the right column's edge: hold that seam and drag sideways to widen or narrow the right column.
 *
 * Why it is worth doing: the middle and right columns split the space evenly, while "which side am I reading
 * right now" changes constantly -- negotiating a price wants a wider conversation, checking seven consensus
 * votes wants a wider right column. The default 1:1 is not good enough for either, and only the user knows which.
 *
 * The implementation only touches one CSS variable (--rw on main); column width computation still lives entirely in the stylesheet.
 */

/* Upper and lower bounds on the right column's width.
   The lower bound follows this column's own reasoning -- 420 is the width at which the evidence strip's two
   columns fit; the upper bound is #right's max-width, beyond which dragging only adds whitespace to its left. */
const MIN = 420
const MAX = 1040
/* Lower bound for the middle column. Dragging stops at this line: the conversation matters more than watching the machine work, and the right column must not squeeze it away. */
const MID_MIN = 420
/* Below 1240 the column widths are fixed in the stylesheet (media query), and dragging is disabled there. */
const MIN_WIDTH = 1240
/* How far each keypress moves. Too small and it takes dozens of presses, too large and it cannot be aimed. */
const STEP = 16
const KEY = 'atara-rw'

export default function PanelGrip() {
  const el = useRef<HTMLDivElement>(null)

  /* The width the user picked. Stored in a ref rather than state: this number is only written into one CSS
     variable and takes no part in rendering. In state, every frame of the drag would run a full React diff
     when the only thing that actually changes per frame is one string. null means they have never dragged, in
     which case nothing is written and the default 1fr stands. */
  const want = useRef<number | null>(null)

  const shell = () => el.current?.closest('main')

  /* How wide the third track actually is at this moment. Measured fresh each time, never bookkept: column
     width also depends on window size, left-column collapse and media queries, so any recorded number goes stale immediately. */
  const track = (m: Element) => {
    const mid = m.querySelector('#mid')
    return mid ? Math.round(m.getBoundingClientRect().right - mid.getBoundingClientRect().right) : 0
  }

  /* The draggable range. The upper bound is not just MAX: MID_MIN has to be left for the middle column, or
     around 1240 the conversation could be squeezed into a sliver. */
  const limits = (m: Element) => {
    const mid = m.querySelector('#mid')
    const box = m.getBoundingClientRect()
    const left = mid ? mid.getBoundingClientRect().left - box.left : 268
    return { lo: MIN, hi: Math.max(MIN, Math.min(MAX, Math.round(box.width - left - MID_MIN))) }
  }

  const clamp = (m: Element, v: number) => {
    const { lo, hi } = limits(m)
    return Math.min(hi, Math.max(lo, Math.round(v)))
  }

  /* Paint the current intent onto the column widths.
     --rw and --rwout must be swapped as a pair: whether the collapse animation can interpolate depends on the
     expanded and collapsed states writing their tracks isomorphically (which is what that comment on main in
     the stylesheet is about). Both are fr by default, and once a px width has been dragged out, the collapsed
     state has to become px too, or collapsing falls back from an animation to a hard cut. */
  const paint = useCallback((m: Element) => {
    const s = (m as HTMLElement).style
    const v = want.current
    if (v == null || innerWidth < MIN_WIDTH) {
      s.removeProperty('--rw')
      s.removeProperty('--rwout')
    } else {
      s.setProperty('--rw', `minmax(0,${clamp(m, v)}px)`)
      s.setProperty('--rwout', 'minmax(0,0px)')
    }
    const g = el.current
    if (!g) return
    const { lo, hi } = limits(m)
    g.setAttribute('aria-valuemin', String(lo))
    g.setAttribute('aria-valuemax', String(hi))
    g.setAttribute('aria-valuenow', String(v == null ? track(m) : clamp(m, v)))
  }, [])

  const save = () => {
    try {
      if (want.current == null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, String(want.current))
    } catch { /* private window */ }
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = shell()
    if (!m || innerWidth < MIN_WIDTH) return
    e.preventDefault()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    /* Turn off the 340ms column-width transition while dragging. Left on, the panel is permanently a third of
       a second behind the cursor and feels like pulling a rubber band. */
    m.classList.add('rdrag')
    /* Start from the actual current column width rather than the last stored value -- if the left column was
       folded or the window resized in between, the stored number no longer matches what is on screen and the
       panel jumps the moment the handle is pressed. */
    want.current = clamp(m, track(m))
    paint(m)

    const move = (ev: PointerEvent) => {
      want.current = clamp(m, m.getBoundingClientRect().right - ev.clientX)
      paint(m)
    }
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      grip.removeEventListener('pointercancel', up)
      m.classList.remove('rdrag')
      save()
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
    grip.addEventListener('pointercancel', up)
  }

  /* It has to be adjustable from the keyboard too. A control that can only be dragged does not exist for people
     who do not use a mouse, and this is a separator, for which arrow keys are the established interaction. */
  const onKey = (e: React.KeyboardEvent) => {
    const m = shell()
    if (!m || innerWidth < MIN_WIDTH) return
    const d = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0
    if (d) {
      e.preventDefault()
      /* Base it on the number already recorded, and only measure the layout when nothing has ever been adjusted.
         Measuring breaks repeated presses: the transition has not started within the same tick, so every press
         reads the same starting point and five presses move one step (measured: 5x16 moved only 16). */
      want.current = clamp(m, (want.current ?? track(m)) + d)
      paint(m)
      save()
    } else if (e.key === 'Home') {
      e.preventDefault()
      reset()
    }
  }

  /* Double-click returns to the default. After dragging it askew you may want the even split back, and otherwise
     the only option is trial and error -- nobody remembers "how wide was it originally". */
  const reset = () => {
    const m = shell()
    if (!m) return
    want.current = null
    paint(m)
    save()
  }

  useEffect(() => {
    const m = shell()
    if (!m) return
    try {
      const raw = localStorage.getItem(KEY)
      const n = raw == null ? NaN : Number(raw)
      if (Number.isFinite(n)) want.current = n
    } catch { /* private window */ }

    /* A window change requires a repaint: first, narrow screens need the inline variable removed so those two
       media queries in the stylesheet take over (an inline custom property outranks them, and without removing
       it, below 1240 you are stuck with a width dragged out for a wide screen); second, the upper bound moves
       with the window, and the middle column's 420 has to stay reserved throughout.
       Only the painting is removed; want is kept -- widen the screen again and it is restored. */
    const sync = () => paint(m)
    sync()
    addEventListener('resize', sync)
    return () => { removeEventListener('resize', sync) }
  }, [paint])

  return (
    <div
      ref={el}
      className="rgrip"
      role="separator"
      aria-orientation="vertical"
      aria-label="Panel width"
      tabIndex={0}
      onPointerDown={onDown}
      onKeyDown={onKey}
      onDoubleClick={reset}
    />
  )
}
