import { useEffect, useRef, useState } from 'react'
import { useAssessment } from '../hooks/useAssessment'

/**
 * The assessment trace in the middle column.
 *
 * Division of labour with the right column: this is a glance inside the conversation
 * flow (what is happening now), the right column is the record (evidence for each step).
 * While running, the title shimmers and the current row spins; once done the title
 * becomes "Assessed in 14s" and collapses but can be reopened -- the process stays
 * inspectable after the conclusion lands.
 */
export default function Thinking() {
  const { run, running } = useAssessment()
  const [open, setOpen] = useState(true)
  const t0 = useRef<number>(0)
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    if (running && !t0.current) t0.current = Date.now()
    if (!running && t0.current) {
      setSecs(Math.max(1, Math.round((Date.now() - t0.current) / 1000)))
      t0.current = 0
    }
  }, [running])

  if (!run) return null

  /* Running and finished use two different phrasings -- "Reading the sources - reading
     sources..." glues the status word to the conclusion and reads as the same sentence twice. */
  const rows = run.steps
    .filter(s => s.st !== 'wait')
    .map(s => ({
      key: s.k,
      state: s.st,
      text: s.st === 'done'
        ? (s.line ? `${s.n} · ${s.line}` : s.n)
        : ({ pull: 'Reading the sources', check: 'Agents checking', cons: 'Reaching consensus' } as Record<string, string>)[s.k]
          ?? s.n,
    }))

  return (
    <div className={'thk' + (open ? ' open' : '')} id="thk">
      <button className="thkh" type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="thksp" aria-hidden>✦</span>
        <span className={'thkl' + (running ? ' shimmer' : '')}>
          {running ? `Assessing ${run.subject}` : `Assessed in ${secs}s`}
        </span>
        <span className="thkc" aria-hidden>⌄</span>
      </button>
      <div className="thkb"><div className="thkin">
        <span className="thkline" aria-hidden />
        <div className="thkrows">
          {rows.map((r, i) => (
            <div key={r.key} className={'thkr ' + (running ? r.state : 'done')}
              style={{ animationDelay: `${i * 90}ms` }}>
              <span className="thkri" aria-hidden />
              <span className="thkrt">{r.text}</span>
            </div>
          ))}
        </div>
      </div></div>
    </div>
  )
}
