import { useEffect, useRef, useState } from 'react'

/**
 * Rolling numbers. A balance that changes rolls up to the new value instead of snapping to it.
 *
 * Why it is worth doing: the moment these numbers change is exactly the moment the user most
 * wants to confirm "did that go through?". Snapping means anyone not staring at it never learns
 * it changed at all -- whereas the roll is itself the statement "this number just moved".
 *
 * No roll on first render: counting from 0 to thirty-five thousand when the page opens is not
 * feedback, it is theatre. Only "a number was already shown and it changed" rolls.
 */
export default function CountUp({
  value,
  format = n => Math.round(n).toLocaleString(),
  ms = 600,
  className,
}: {
  value: number
  /** How to turn the number into text. Defaults to rounding plus thousands separators. */
  format?: (n: number) => string
  ms?: number
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    /* Do nothing if the value did not change. Running the animation on every parent re-render
       would make the number jitter constantly under polling (this project polls every 3s all over). */
    if (from.current === value) return

    /* Land immediately when the system asks for reduced motion. "A number running on its own" is
       precisely the kind of thing that preference is about -- it keeps moving and the reader
       cannot fix their eyes on it. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value
      setShown(value)
      return
    }

    const a = from.current
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      /* ease-out: fast at the start, slow at the end. Linear counting looks like a machine reading
         off seconds, whereas what we want here is "settling". */
      setShown(a + (value - a) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else from.current = value
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, ms])

  /* tabular-nums keeps every digit the same width: without it the whole line shifts left and right
     while rolling, and everything next to it jitters along. */
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{format(shown)}</span>
}
