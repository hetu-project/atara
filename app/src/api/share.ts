/**
 * Collapse identical concurrent requests into one.
 *
 * The problem this exists for: a screen can hold many copies of a component
 * that each need the same account-wide or app-wide fact. A conversation with
 * twenty-one orders renders twenty-one order cards, and each one asked for the
 * chain config and the wallet — forty-two requests for two answers, fired in
 * the same tick.
 *
 * That is not merely wasteful. A browser opens about six connections per
 * origin and two are already held open by the live streams, so the rest queue:
 * requests sit at 0 bytes for twenty seconds waiting for a free socket, and
 * the page looks broken while the server is idle.
 *
 * Two behaviours, and the difference between them matters:
 *
 *   dedupe   one request per key while one is in flight; the moment it lands
 *            the entry is dropped. Nothing is ever served stale. This is what
 *            a balance needs.
 *
 *   ttl      additionally hold the answer for a while. Only for facts that do
 *            not change while a tab is open, and even then bounded rather than
 *            forever, so a backend restart cannot pin a wrong answer for the
 *            life of the session.
 *
 * Deliberately not a general cache. There is no invalidation, no keying on
 * arguments beyond what the caller passes, and no storage — because the
 * problem is a burst of identical calls in one tick, and anything larger would
 * need an answer to "when is this wrong?" that nobody would maintain.
 */

interface Entry<T> {
  p: Promise<T>
  /** When the answer may still be handed out. 0 means in-flight only. */
  until: number
}

const live = new Map<string, Entry<unknown>>()

export function shared<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = live.get(key) as Entry<T> | undefined
  if (hit && (hit.until === 0 || now < hit.until)) return hit.p

  const p = run()
  const entry: Entry<T> = { p, until: 0 }
  live.set(key, entry as Entry<unknown>)

  void p.then(
    () => {
      // Only now does the TTL start: measuring it from the request going out
      // would spend most of a short window waiting for the answer.
      if (live.get(key) === entry) {
        if (ttlMs > 0) entry.until = Date.now() + ttlMs
        else live.delete(key)
      }
    },
    () => {
      /* A failure is never cached. The callers retry with backoff (useApi),
         and holding a rejected promise would hand the same failure to every
         one of them for the rest of the window — turning one bad moment into
         a screen that stays broken. */
      if (live.get(key) === entry) live.delete(key)
    },
  )
  return p
}

/** Drop everything. For sign-out: the next reader must not see the last
    account's answers. */
export function clearShared() {
  live.clear()
}
