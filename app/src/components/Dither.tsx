/**
 * Dither loading animation: a 4x4 grid lighting up in ordered-dither order, in waves.
 *
 * Ported from beui.dev's Loader (the `dither` variant in docs/loading.md). The original uses
 * motion/react + Tailwind; this is plain CSS -- the whole animation only moves opacity, so pulling
 * in an animation library for it is not worth it, and CSS animations run on the compositor thread,
 * so they do not stutter while the main thread is busy receiving streamed text.
 */

/**
 * 4x4 Bayer ordered-dither matrix, unrolled row by row.
 *
 * It decides each cell's phase. These numbers are not in an arbitrary order: a Bayer matrix keeps
 * neighbouring cells' values as far apart as possible, so cells light up in a scattered way with no
 * obvious direction, unlike a left-to-right sweep -- replace it with 0..15 in order and it becomes
 * a scanline, which is a different animation.
 */
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export default function Dither({
  size = 22,
  speed = 1.1,
  label = 'Atara AI is replying',
}: {
  /** Side length of the whole block (px). Cells and gaps are derived from it. */
  size?: number
  /** Seconds in one complete breathing cycle. */
  speed?: number
  label?: string
}) {
  const gap = Math.max(1, size * 0.05)
  const cell = (size - gap * 3) / 4

  return (
    <span className="dither" role="status" aria-label={label}
      style={{ gap: `${gap}px`, gridTemplateColumns: `repeat(4, ${cell}px)` }}>
      {BAYER_4.map((order, i) => (
        <i key={i} style={{
          width: cell, height: cell,
          animationDuration: `${speed}s`,
          /* Negative delay: the animation starts from a point where it has "already been running",
             so the first frame is already the steady state. With a positive delay, cells late in the
             phase order wait nearly a full cycle before lighting up for the first time -- and this
             loading state often lasts only a second or two, so those cells stay dark throughout and
             it looks like a few of them are broken. */
          animationDelay: `${-(order / BAYER_4.length) * speed}s`,
        }} />
      ))}
    </span>
  )
}
