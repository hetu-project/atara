import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches render-phase exceptions.
 *
 * This exists because Privy used to throw outright when initialised over plain
 * HTTP: the whole tree unmounted, the screen went black, and not a single word
 * was left on it — only the browser console knew what had happened. During a
 * demo that is the worst way to fail: whoever is watching concludes the entire
 * system is broken.
 *
 * So whatever throws from now on, at least the reason is shown.
 */
export default class Boundary extends Component<
  { children: ReactNode },
  { msg: string; where: string }
> {
  state = { msg: '', where: '' }

  static getDerivedStateFromError(e: unknown) {
    return { msg: e instanceof Error ? e.message : String(e) }
  }

  /**
   * Record *which component* threw.
   *
   * A message alone is often not enough. The classic case is "Rendered fewer
   * hooks than expected": it reports a hook count mismatch, while the real
   * cause is usually another hook's callback throwing mid-render — that error
   * is hidden behind this one. Without the component stack the only clue is a
   * sentence that fits everything, and the rest is guesswork.
   *
   * Also logged with console.error: the on-screen copy is for the person
   * looking at it, the console copy carries the full stack for whoever comes
   * to debug it.
   */
  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error('Boundary caught:', err, info.componentStack)
    this.setState({ where: (info.componentStack ?? '').trim() })
  }

  render() {
    if (!this.state.msg) return this.props.children
    const box = {
      background: '#1b1c21', border: '1px solid #33343a', borderRadius: 8,
      padding: 16, overflowX: 'auto' as const, fontSize: 13,
      whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
    }
    /* A DOM node React tried to remove or reorder was no longer where React
       left it. That is what browser page translation does to a live React
       tree (see polyfills.ts, which guards against it); the same message can
       come from any extension that rewrites the page. It is not a
       configuration problem and a reload fixes it, so say so instead of the
       generic "refreshing usually does not help". */
    const moved = /removeChild|insertBefore/.test(this.state.msg)
      && /not a child|NotFoundError/.test(this.state.msg)
    const btn = {
      marginTop: 16, padding: '8px 14px', borderRadius: 6, border: '1px solid #33343a',
      background: '#26272d', color: '#f4f4f5', cursor: 'pointer', fontSize: 13,
    }
    return (
      <div style={{
        padding: '48px 32px', maxWidth: 640, margin: '0 auto',
        fontFamily: 'ui-sans-serif, system-ui', color: '#f4f4f5',
      }}>
        <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>
          {moved ? 'The page was changed underneath the app' : 'The console could not start'}
        </h1>
        <p style={{ color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 16px' }}>
          {moved
            ? 'The browser’s "Translate this page" or an extension rewrote the page structure, ' +
              'and the interface could not find its own elements while updating. ' +
              'Reloading fixes it; if it keeps happening, turn off page translation for this site.'
            : 'The page threw an exception while initialising. The reason is below. ' +
              'Reloading usually does not help — this is most often a configuration problem.'}
        </p>
        <pre style={{ ...box, color: '#f87171' }}>{this.state.msg}</pre>
        <button type="button" style={btn} onClick={() => location.reload()}>Reload</button>
        {this.state.where && (
          <>
            {/* The top few lines of the component stack are enough — below them
                sit the providers and layout containers, identical on every
                crash and no help in telling which component broke. The full
                stack is in the browser console. */}
            <p style={{ color: '#a1a1aa', margin: '16px 0 8px', fontSize: 13 }}>
              Thrown here (full stack in the browser console):
            </p>
            <pre style={{ ...box, color: '#a1a1aa' }}>
              {this.state.where.split('\n').slice(0, 8).join('\n')}
            </pre>
          </>
        )}
      </div>
    )
  }
}
