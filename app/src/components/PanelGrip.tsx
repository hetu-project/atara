import { useCallback, useEffect, useRef } from 'react'

/**
 * 右栏边缘的拖拽把手：按住那条缝左右拖，右栏就宽了窄了。
 *
 * 为什么值得做：中栏和右栏是对半分的，而「这一刻我在读哪一边」是随时在变的——
 * 谈价钱的时候想要对话宽一点，核对七票共识的时候想要右栏宽一点。默认的 1:1
 * 对两边都不够好，而这件事只有用户自己知道。
 *
 * 实现上只动一个 CSS 变量（main 上的 --rw），列宽的计算仍然全在样式表里。
 */

/* 右栏宽度的上下限。
   下限沿用这一栏自己的说法——420 是证据条两列排得开的宽度；
   上限是 #right 的 max-width，再往宽拖也只是在它左边留白。 */
const MIN = 420
const MAX = 1040
/* 中栏的下限。拖到这条线就停：对话比旁观机器干活重要，不能为了右栏把它挤没。 */
const MID_MIN = 420
/* 1240 以下列宽在样式表里是写死的（media query），那时不给拖。 */
const MIN_WIDTH = 1240
/* 键盘每下走多少。太小要按几十下，太大调不准。 */
const STEP = 16
const KEY = 'atara-rw'

export default function PanelGrip() {
  const el = useRef<HTMLDivElement>(null)

  /* 用户选的宽度。存 ref 不存 state：这个数只写进一个 CSS 变量，不参与渲染。
     进 state 的话，拖动时每一帧都要走一遍 React 的 diff，而每一帧真正要改的
     只有一个字符串。null 表示他还没拖过，那就什么都不写，保持默认的 1fr。 */
  const want = useRef<number | null>(null)

  const shell = () => el.current?.closest('main')

  /* 第三条 track 此刻实际有多宽。每次现量，不记账：列宽还受窗口大小、左栏
     折叠、media query 影响，记下来的那个数随时会过期。 */
  const track = (m: Element) => {
    const mid = m.querySelector('#mid')
    return mid ? Math.round(m.getBoundingClientRect().right - mid.getBoundingClientRect().right) : 0
  }

  /* 能拖到的范围。上限不只是 MAX：还得给中栏留下 MID_MIN，
     否则在 1240 附近可以把对话挤成一条缝。 */
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

  /* 把当前意图画到列宽上。
     --rw 和 --rwout 必须成对换：收起动画能不能插值，前提是展开态和收起态的
     track 写法同构（样式表里 main 那段注释讲的就是这件事）。默认两边都是 fr，
     一旦拖出 px 宽度，收起态也得跟着换成 px，不然收起会从动画退回硬切。 */
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
    } catch { /* 隐身窗口 */ }
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = shell()
    if (!m || innerWidth < MIN_WIDTH) return
    e.preventDefault()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    /* 拖动期间关掉列宽的 340ms 过渡。不关的话面板永远慢光标三分之一秒，
       手感像在拉一根皮筋。 */
    m.classList.add('rdrag')
    /* 从当前实际列宽起步，而不是从上次存的值——中途折过左栏、改过窗口的话，
       存的那个数和屏幕上看到的已经对不上，一按下去面板会先跳一下。 */
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

  /* 键盘也要能调。只能拖的控件对不用鼠标的人等于不存在，而这是个 separator，
     方向键是它的既定操作方式。左键往左推那条缝，也就是右栏变宽。 */
  const onKey = (e: React.KeyboardEvent) => {
    const m = shell()
    if (!m || innerWidth < MIN_WIDTH) return
    const d = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0
    if (d) {
      e.preventDefault()
      /* 基准取已经记下的那个数，只有从没调过时才去量布局。量的话连按会失灵：
         过渡在同一个 tick 里还没开始跑，每一下读到的都是同一个起点，按五下
         只走一格（实测 5×16 只挪了 16）。 */
      want.current = clamp(m, (want.current ?? track(m)) + d)
      paint(m)
      save()
    } else if (e.key === 'Home') {
      e.preventDefault()
      reset()
    }
  }

  /* 双击回到默认。拖歪了想回到对半分，否则只能一点点试——而「原来是多宽」
     没人记得住。 */
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
    } catch { /* 隐身窗口 */ }

    /* 窗口变了要重画：一是窄屏得把内联变量撤掉，让样式表那两条 media query
       说了算（内联的自定义属性优先级压过它们，不撤的话 1240 以下会顶着一个
       为宽屏拖出来的宽度）；二是上限跟着窗口变，中栏的 420 得一直留得住。
       撤的只是画面，want 留着——屏幕宽回来照样还原。 */
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
