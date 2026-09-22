import { useEffect, useRef } from 'react'
import type { IFlytekStreamer } from '../services/iflytek'

/** Number of waveform bars. Dense enough to read as a waveform, but too dense and it smears into grey on a 400px phone. */
const BARS = 28

/**
 * The pill shown while recording: waveform + cancel + done.
 *
 * The waveform is **real volume**, not a looping animation. The difference shows when the
 * mic is broken, the system is muted, or nobody is actually speaking into it -- a fake
 * animation keeps bouncing, a real waveform goes flat, and you can see it instantly.
 */
export default function VoiceBar({
  streamer,
  onCancel,
  onConfirm,
}: {
  streamer: IFlytekStreamer
  onCancel: () => void
  onConfirm: () => void
}) {
  const wave = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* Volume is written straight into the DOM, never into state: setState at 60fps would
       re-render the whole composer sixty times a second when all that changed is the height
       of 28 bars. */
    const bars = Array.from(wave.current?.children ?? []) as HTMLElement[]
    /* Scrolling history, entering right and leaving left. One array, shifted one slot per frame. */
    const hist = new Array<number>(BARS).fill(0)
    let raf = 0
    let last = 0

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      /* Even on a 120Hz screen this advances only ~24 slots/second: pushing one per frame
         makes the waveform too fast to tell which bump belongs to which word. */
      if (t - last < 42) return
      last = t

      hist.shift()
      hist.push(streamer.level())
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        if (b) b.style.transform = `scaleY(${0.08 + (hist[i] ?? 0) * 0.92})`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [streamer])

  return (
    <div className="vrec" role="group" aria-label="Recording">
      {/* The waveform is decorative: what it says (recording is on) is already clear from the
          two buttons below it, and reading out 28 bars again is just noise for a screen reader. */}
      <div className="vwave" ref={wave} aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <button className="vx" title="Cancel" aria-label="Cancel voice input" onClick={onCancel}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <button className="vok" title="Done" aria-label="Finish voice input" onClick={onConfirm}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-6.5" />
        </svg>
      </button>
    </div>
  )
}
