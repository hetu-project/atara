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

/**
 * A spinner, for a wait with nothing to report but that it is still going.
 *
 * Ported from the loader set in docs/loading.md -- its `spinner` variant, kept to the same
 * proportions (stroke at 9% of the box, a quarter arc over a track at a fifth opacity, one linear
 * turn per `speed`). The original is built on motion/react and Tailwind, neither of which this
 * project has, so the rotation is a CSS animation instead; nothing about how it looks changes.
 *
 * Why this variant and not one of the livelier ones: `percent` was the tempting one and is the one
 * to refuse -- it draws a number climbing to 100 when nothing here knows how far along anything is,
 * and an invented progress bar is a lie told precisely while someone is watching their money move.
 * A spinner claims only what is true: still waiting.
 *
 * The reduced-motion fallback is the source's own -- an opacity pulse, no rotation -- and lives in
 * the stylesheet beside the animation.
 */
export function Spinner({
  size = 14, speed = 1, label = 'Working',
}: { size?: number; speed?: number; label?: string }) {
  const stroke = Math.max(2, size * 0.09)
  const r = (size - stroke) / 2
  const c = size / 2
  return (
    <svg className="spin" width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ animationDuration: `${speed}s` }} role="img" aria-label={label}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor"
        strokeOpacity={0.2} strokeWidth={stroke} />
      {/* Quarter arc, top to right, round-capped -- the moving part. */}
      <path d={`M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c + r} ${c}`} fill="none"
        stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  )
}
