import type { ApiError } from '../api/client'

/**
 * What a list shows before its data is there, and when it is not coming.
 *
 * Both used to render as the empty state: "No contacts yet" while the request
 * was still out, and the same words once it had failed. Three situations that
 * ask three different things of the reader — wait, add one, try again — drawn
 * as one. The wallet card on the account page already refuses to do this for
 * numbers ("painting $0 first and then jumping to the real figure is telling
 * a lie first"); lists deserve the same.
 *
 * Pending keeps the height and says "not yet". Failed says what went wrong and
 * hands over the one action that helps. Neither is used once data has arrived:
 * a poll that fails later keeps the last good list on screen (useApi only
 * replaces data on success), and that is the right call — stale beats blank.
 */
export function Pending({ rows = 3, card = false }: { rows?: number; card?: boolean }) {
  /* Widths vary so it reads as lines of text, not a barcode. */
  const widths = ['72%', '48%', '61%', '55%', '66%']
  return (
    <div className={'pending' + (card ? ' card' : '')} aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} className="sk sk-row" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  )
}

/* A network failure carries a message nobody can act on ("Failed to fetch");
   name the situation instead. Anything the server said in words passes through:
   those are written for the person reading them. */
const say = (e: ApiError) =>
  e.code === 'NETWORK' ? 'Could not reach the server.' : e.message

/**
 * `onRetry` is useApi's reload: it resets the backoff and asks now. Without a
 * handler the line just states the fact — for a list whose owner retries on
 * its own and has nothing else to offer.
 */
export function Failed({
  error, onRetry, compact = false,
}: { error: ApiError; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={'failed' + (compact ? ' compact' : '')} role="alert">
      <span>{say(error)}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
