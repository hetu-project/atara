import { useEffect, useState } from 'react'

/**
 * The viewport width at which the console stops being a three-column desk.
 *
 * **This number is duplicated in console.css** (`@media (max-width:760px)`), and the two have to agree: the CSS
 * collapses the grid while the JS decides whether the right column is rendered at all. Kept here as the single
 * place to change it, with the CSS block labelled to point back.
 *
 * 760 follows the landing page's existing scale (900 / 760 / 600 / 560) rather than inventing a new one.
 */
export const MOBILE = 760

/**
 * Subscribe to a media query.
 *
 * Reads once during the initial state so the first paint is already correct -- deriving it in an effect would
 * render the desktop tree first and then throw it away, which on a phone means mounting the whole right column
 * (and starting its polling) for one frame.
 */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => {
    try { return matchMedia(query).matches } catch { return false }
  })
  useEffect(() => {
    let mq: MediaQueryList
    try { mq = matchMedia(query) } catch { return }
    const sync = () => setOn(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return on
}

/** True on phone-width viewports. The right column is not rendered here -- see App.tsx. */
export const useIsMobile = () => useMedia(`(max-width:${MOBILE}px)`)
