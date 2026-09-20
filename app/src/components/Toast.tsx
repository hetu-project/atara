import { createContext, useCallback, useContext, useRef, useState } from 'react'

/**
 * 全局操作反馈。
 *
 * 这个项目原来**没有**它：`console.css` 里躺着一整段 `#ftoast` 的样式，
 * 但整个 src 里没有一处 JSX 引用——当初照参照抄样式时漏掉了实现那一半。
 * 后果是复制地址、保存账户、撤销额度这些动作全都悄无声息，
 * 而失败只能塞进某个视图自己的一行灰字里，那行字经常在屏幕外。
 *
 * 刻意做得小：一个 provider、一个 hook、没有队列优先级、没有位置配置。
 * 需要更多的时候再加，现在加了也没人用。
 */

export type ToastKind = 'ok' | 'err' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  kind: ToastKind
  text: string
  action?: ToastAction
  leaving?: boolean
}

interface Ctx {
  toast: (text: string, opts?: { kind?: ToastKind; action?: ToastAction; ms?: number }) => void
}

const ToastCtx = createContext<Ctx>({ toast: () => {} })

/** 在任何组件里 `const { toast } = useToast()`。 */
export const useToast = () => useContext(ToastCtx)

/* 同时最多留三条。再多就开始互相遮挡，而第四条到来时人根本还没读完第一条。 */
const MAX = 3
/* 出场动画的时长，和 CSS 里 .tst 的 transition 对齐。 */
const LEAVE_MS = 220

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const seq = useRef(0)
  /* 每条各自的定时器。存起来是为了「鼠标停在上面就别消失」——
     人正要去点那颗「重试」，它在手指落下前消失是最气人的一种交互。 */
  const timers = useRef(new Map<number, number>())

  const drop = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    /* 先标记 leaving 让它淡出，再真的移除。直接删的话它是瞬间消失的，
       而人眼会把「突然不见」读成「我点错了什么」。 */
    setList(l => l.map(x => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), LEAVE_MS)
  }, [])

  const arm = useCallback((id: number, ms: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.set(id, setTimeout(() => drop(id), ms) as unknown as number)
  }, [drop])

  const toast = useCallback<Ctx['toast']>((text, opts) => {
    const kind = opts?.kind ?? 'ok'
    /* 报错停久一点：成功只是确认一件已经发生的事，扫一眼就够；
       失败要读懂、可能还要决定下一步。带按钮的更久，不然按钮没用。 */
    const ms = opts?.ms ?? (opts?.action ? 8000 : kind === 'err' ? 5000 : 2600)
    const id = ++seq.current
    setList(l => [...l.slice(-(MAX - 1)), { id, kind, text, action: opts?.action }])
    arm(id, ms)
  }, [arm])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* aria-live=polite：读屏会念出来，但不会打断用户正在读的内容。
          报错那条也用 polite 而不是 assertive——这些不是紧急警报，
          assertive 会粗暴地打断当前朗读。 */}
      <div className="tsts" role="status" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={'tst tst-' + t.kind + (t.leaving ? ' out' : '')}
            onMouseEnter={() => { const x = timers.current.get(t.id); if (x) clearTimeout(x) }}
            onMouseLeave={() => arm(t.id, 2000)}>
            <span className="tsti" aria-hidden>{t.kind === 'err' ? '!' : t.kind === 'ok' ? '✓' : 'i'}</span>
            <span className="tstx">{t.text}</span>
            {t.action && (
              <button className="tsta" onClick={() => { t.action!.onClick(); drop(t.id) }}>
                {t.action.label}
              </button>
            )}
            <button className="tstc" aria-label="Dismiss" onClick={() => drop(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
