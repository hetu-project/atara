import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTH_CHANGED, ApiError } from '../api/client'
import { isWalletTxError } from '../api/walletError'

/**
 * Errors that retrying cannot fix. Asking again just fills the log: the record
 * is not there, or it is not yours, and no amount of waiting changes that.
 *
 * 401s are deliberately *not* here. They look permanent and are usually not:
 * an access token expires while the tab is open, Privy renews it in the
 * background, and the next attempt succeeds. Treating them as fatal froze every
 * hook on the page until someone pressed F5 — the exact failure this retry
 * logic exists to remove. Backoff handles the genuinely signed-out case well
 * enough, since it settles at one quiet request every thirty seconds.
 */
const FATAL = new Set(['UNKNOWN_ACTOR', 'NOT_FOUND', 'NOT_YOURS'])

/* Backoff for everything else. A backend restart takes a few seconds, so the
   first couple of retries land inside that window and the user sees nothing;
   a server that is really down gets asked once every half minute instead of
   once a second by each of the thirty-odd hooks on screen. */
const RETRY_FIRST = 500
const RETRY_MAX = 30_000

function backoff(fails: number): number {
  const raw = Math.min(RETRY_MAX, RETRY_FIRST * 2 ** Math.max(0, fails - 1))
  /* Jitter, because every hook on the page failed at the same instant and would
     otherwise retry in lockstep — the same thundering herd the backoff is meant
     to avoid, just at a slower tempo. */
  return Math.round(raw * (0.7 + Math.random() * 0.6))
}

export interface AsyncState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/**
 * Fetch once; fetch again when deps change.
 *
 * pollMs keeps it fetching — order state is advanced by the backend scheduler,
 * and without polling the change never shows.
 *
 * Two things are scheduled from the *completion* of the previous attempt rather
 * than on a fixed timer:
 *
 *   polling — a new request never leaves while one is still outstanding. The
 *     fixed interval used to fire regardless, so an endpoint slower than its own
 *     poll interval accumulated requests (/orders polls at 2s and was taking
 *     3.5s) and got slower for it.
 *
 *   retries — a failure that is not FATAL is retried with growing delay.
 *     Without it any one-shot fetch that failed stayed empty for the life of the
 *     page: a backend restart, a sleeping laptop or a dropped wifi frame left
 *     parts of the screen blank with nothing to bring them back but F5.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  pollMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  /* Bumped whenever an attempt finishes, win or lose. The scheduler below hangs
     off it, which is what makes "next request" mean "after this one came back"
     rather than "every N milliseconds no matter what". */
  const [settled, setSettled] = useState(0)
  // fn is a fresh closure on every render, so putting it in deps loops forever -- keep the latest one in a ref.
  const fnRef = useRef(fn)
  fnRef.current = fn
  /* Consecutive failures, for the backoff. A ref, not state: changing it must
     not itself cause a render, and the scheduler reads it at the moment it runs. */
  const fails = useRef(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fnRef.current()
      .then(d => { if (alive) { setData(d); setError(null); fails.current = 0 } })
      .catch((e: unknown) => {
        if (!alive) return
        fails.current += 1
        setError(e instanceof ApiError ? e : new ApiError(0, {
          code: 'NETWORK', message: e instanceof Error ? e.message : 'Request failed',
        }))
      })
      .finally(() => {
        /* Not when a newer attempt has taken over: its own completion schedules
           what comes next, and counting this one too would run two timers. */
        if (!alive) return
        setLoading(false)
        setSettled(n => n + 1)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(() => {
    // Nothing has been attempted yet — the fetch effect above is doing that.
    if (settled === 0) return
    // An error retrying cannot fix: stop asking. Recovery comes from deps
    // changing, an explicit reload, or AUTH_CHANGED.
    if (error && FATAL.has(error.code)) return

    const delay = error ? backoff(fails.current) : pollMs
    if (!delay) return
    /* No poll while the tab is in the background. Nobody is looking, and a
       page left open on Discover would otherwise ask every 15 seconds for as
       long as the laptop stays awake. Retries after an error still run: they
       are about getting the page back to a working state, not about freshness.
       The visibility effect below asks once the moment the tab comes back, so
       the reader sees the current list, not one that is up to a poll old. */
    if (!error && document.hidden) return
    const t = setTimeout(() => setTick(n => n + 1), delay)
    return () => clearTimeout(t)
  }, [settled, pollMs, error])

  useEffect(() => {
    if (!pollMs) return
    const back = () => { if (document.visibilityState === 'visible') setTick(n => n + 1) }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [pollMs])

  /* Refetch when sign-in or sign-out completes.
   *
   * Without this, anything fetched while authentication was still settling is
   * stuck: the request came back 401 and nothing without a poll interval ever
   * asks again. The window is small but it is exactly the moment a page is
   * being set up, so it hit the sidebar profile and every card on Discover.
   *
   * Cheap to do for everyone rather than picking which hooks need it: the alternative
   * is each call site deciding whether it is auth-sensitive, and the ones that
   * guess wrong fail silently. */
  useEffect(() => {
    const again = () => setTick(n => n + 1)
    addEventListener(AUTH_CHANGED, again)
    return () => removeEventListener(AUTH_CHANGED, again)
  }, [])

  /* An explicit reload is the person saying "try now", so it starts the backoff
     over rather than waiting out a delay that grew while they were watching. */
  const reload = useCallback(() => { fails.current = 0; setTick(n => n + 1) }, [])
  return { data, error, loading, reload }
}

/** A manually triggered action: exposes pending and error so every button does not reimplement them. */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setPending(true)
    setError(null)
    try {
      return await fn()
    } catch (e: unknown) {
      /* A declined wallet signature has already been toasted by the API layer;
         repeating it under the button would read as a second failure. */
      if (!isWalletTxError(e)) {
        setError(e instanceof ApiError ? e : new ApiError(0, {
          code: 'NETWORK', message: e instanceof Error ? e.message : 'Request failed',
        }))
      }
      return null
    } finally {
      setPending(false)
    }
  }, [])

  return { run, pending, error, clearError: () => setError(null) }
}
