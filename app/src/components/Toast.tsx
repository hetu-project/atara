import { createContext, useCallback, useContext, useRef, useState } from 'react'

/**
 * Global action feedback.
 *
 * This project originally did **not** have it: `console.css` carried a whole block of `#ftoast`
 * styles, but nowhere in src was there a single JSX reference -- copying the reference's styles
 * had skipped the implementation half.
 *
 * The consequence was that copying an address, saving an account and revoking an allowance all
 * happened in silence, while failures could only be squeezed into some view's own line of grey
 * text, often off screen.
 *
 * Deliberately small: one provider, one hook, no queue priorities, no position configuration.
 * Add more when it is needed; adding it now would leave it unused.
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

/** In any component: `const { toast } = useToast()`. */
export const useToast = () => useContext(ToastCtx)

/* At most three at a time. Beyond that they start covering each other, and by the time the fourth arrives nobody has finished reading the first. */
const MAX = 3
/* Duration of the entry animation, kept in sync with .tst's transition in the CSS. */
const LEAVE_MS = 220

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const seq = useRef(0)
  /* One timer per toast. They are kept so that "hovering stops it disappearing" works -- having it
     vanish just as the finger comes down on that Retry button is the most infuriating kind of interaction. */
  const timers = useRef(new Map<number, number>())

  const drop = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    /* Mark as leaving to fade it out first, then actually remove it. Removing it directly makes it
       vanish instantly, and the eye reads "suddenly gone" as "did I click something wrong?". */
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
    /* Errors linger longer: a success only confirms something that already happened and a glance is
       enough; a failure has to be read and possibly acted on. Ones with a button last longer still,
       or the button is useless. */
    const ms = opts?.ms ?? (opts?.action ? 8000 : kind === 'err' ? 5000 : 2600)
    const id = ++seq.current
    setList(l => [...l.slice(-(MAX - 1)), { id, kind, text, action: opts?.action }])
    arm(id, ms)
  }, [arm])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* aria-live=polite: a screen reader will announce it without interrupting what the user is
          currently reading. Errors use polite rather than assertive too -- these are not emergency
          alerts, and assertive would rudely cut off the current announcement. */}
      <div className="tsts" role="status" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={'tst tst-' + t.kind + (t.leaving ? ' out' : '')}
            /* Hold on any press as well as on hover. A touch user never produces mouseenter, so a toast with a
               Retry button would keep counting down while the finger was still travelling to it -- the one case
               where the timer matters most. pointerenter covers the mouse; pointerdown covers the tap. */
            onPointerEnter={() => { const x = timers.current.get(t.id); if (x) clearTimeout(x) }}
            onPointerDown={() => { const x = timers.current.get(t.id); if (x) clearTimeout(x) }}
            onPointerLeave={() => arm(t.id, 2000)}>
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
