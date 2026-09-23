import { useEffect, useRef } from 'react'
import { RISK_AGENTS } from './agents'
import { consensusNet, consensusRing } from './rings'

/**
 * The consensus ring. Its idle state is a ring of grey ticks -- "not started yet" and "score 0"
 * must not look the same, so idle gets no start delay and the ring is drawn without sweeping.
 *
 * The canvas animates to the final score by itself, so it is built once per
 * run rather than per frame. It does have to be rebuilt when the score
 * arrives, though: a run starts with a blank record and the real number lands
 * a moment later, and leaving it out of the deps froze the ring on whatever
 * the placeholder was.
 */
export function Ring({
  score = 0, passed, total, runId, settled = false, stepMs = 620,
}: {
  score?: number
  /** How many agents agreed, for the line under the number. */
  passed?: number
  /** How many have to agree. Decides whether the tick is shown. */
  total?: number
  runId?: string
  /**
   * Draw the finished state at once, without sweeping up to it.
   *
   * For a stored assessment: it finished when the order was placed, and animating it again would stage a check
   * that is not happening. Needed as its own flag because a record has no runId, and without one the ring took
   * the idle path and painted 0 next to a verdict that read 66.
   */
  settled?: boolean
  stepMs?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    consensusRing(ref.current, RISK_AGENTS, runId ? 0 : null, stepMs, score, null,
      passed, total, settled)
  }, [runId, score, passed, total, stepMs, settled])
  return (
    <canvas ref={ref} className={'arring' + (runId || settled ? '' : ' dim')}
      width={220} height={220}
      aria-label={settled ? `Assessment result ${score} of 100`
        : runId ? 'Assessment running' : 'No assessment running'} />
  )
}

/**
 * Constellation. Seven agents turning slowly in orbit, taking no position -- "standing by" made
 * visible, which reads better than seven grey pills.
 */
export function Constellation({ live = false, done = false }: { live?: boolean; done?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const box = c?.parentElement?.parentElement   // #rs-table; the chart sizes its height to this cell
    if (!c || !box) return
    let built = 0
    /* Measure the real cell: a hardcoded number gets the bottom row of dots clipped by
       overflow:hidden inside a short cell. On the mount tick the cell height is still 0, and
       measuring too early collapses the whole chart into a line -- so wait for layout to settle
       and rebuild on resize. The canvas's own _refit only handles width; a height change requires
       a full redraw. */
    const build = () => {
      const h = Math.max(150, Math.min(300, (box.clientHeight || 244) - 8))
      if (Math.abs(h - built) < 4) return
      built = h
      /* The idle=true variant draws dots only, no edges (`if(!idle) edges.forEach(...)` in the
         reference). Once a run has happened it must be drawn as a web: those edges say "these seven
         did not each judge alone, they compared notes", and that is the entire meaning of the word
         "consensus" on this panel. The original hardcoded true, so the chart was a scatter of
         loose dots whether or not anything had run.

         After a run it freezes on the final frame and does not replay: the animation runs for a
         dozen-odd seconds, and the chart rebuilds whenever the window widens -- replaying from the
         start each time would read as another assessment having been run. */
      const FROZEN = 99_000
      consensusNet(c, RISK_AGENTS, 0, 1050, done ? FROZEN : null, !live, h)
    }
    const ro = new ResizeObserver(build)
    ro.observe(box)
    return () => ro.disconnect()
    // A change in live requires a full redraw: edges are decided once inside build
  }, [live, done])
  return (
    <div className="rtnetw">
      <canvas ref={ref} className="rtnet" aria-label="Seven risk agents" />
    </div>
  )
}
