import { useState } from 'react'
import type { OrderAssessment } from '../api/types'

/**
 * The pre-order risk assessment, as the card that lands in the conversation.
 *
 * The structure follows the reference's consensusThenDeal() point for point: a checklist line of
 * "what was read, how many votes, passed or not", an expandable Trust Gate card, and four summary
 * rows on the card.
 *
 * All data comes from the assessment snapshot in the ticket endpoint -- including the "read 23
 * sources, 447 records" line. That sentence exists to justify the release to the user, and inventing
 * a nice-looking number in the frontend means propping up a judgement with a lie, so if the backend
 * does not supply it, it is not shown.
 */

/* Those four summary rows come from four specific agents. The reference picks Identity / Provenance /
   Sanctions / Pricing; ours map to the four below -- different names, same questions. If one cannot be
   fetched, that row is omitted rather than padded with something else. */
const SUMMARY: [string, string][] = [
  ['Counterparty', 'Counterparty history'],
  ['Funds', 'Source of funds'],
  ['Compliance', 'Sanctions screening'],
  ['Market', 'Velocity check'],
]

export default function AssessCard({ a, peer }: { a: OrderAssessment; peer?: string }) {
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState(true)
  const notes = a.votes.filter(v => v.verdict !== 'pass')
  const cleared = a.votes.length - notes.length
  const ok = a.passed >= a.threshold

  /* The seconds in the title are only printed when it really ran for more than a second.
     The reference's "Assessed in 13s" is however long its animation happened to take; here the
     assessment is computed, and it took however long the backend measured. Inventing a plausible
     number means propping up the impression "we really did check" with a lie. */
  const secs = a.took_ms && a.took_ms >= 1000 ? Math.round(a.took_ms / 1000) : 0

  /* Four rows, worded against the reference's arunStep point for point. The first is "read this
     order" -- it states what was assessed, and without it the three numbers below hang in mid-air. */
  const rows = [
    peer ? `Read the order · ${peer}` : 'Read the order',
    a.sources > 0 ? `Read ${a.sources} sources · ${a.records.toLocaleString()} records` : '',
    `${cleared} of ${a.total} cleared${notes.length ? ` · ${notes.length} with a note` : ''}`,
    `${a.passed}/${a.total} agree · needs ${a.threshold} of ${a.total} — ${ok ? 'approved' : 'held'}`,
  ].filter(Boolean)

  const summary = SUMMARY
    .map(([label, agent]) => [label, a.votes.find(v => v.agent === agent)?.note] as const)
    .filter((x): x is readonly [string, string] => !!x[1])

  return (
    <>
      {/* The trace left after a run, structurally the same .thk as Thinking.tsx.

          The difference is where the data comes from: Thinking hangs off this run's transient state
          and is gone on refresh, while this renders from the assessment snapshot stored with the
          ticket, so next time you open this conversation, what was assessed and what justified the
          release is still there. In the reference the run lights up row by row as an animation;
          here it is a look back after the fact -- the assessment finished the moment the order was
          placed, and replaying a progress bar would be fake, so every row is simply done. */}
      <div className={'thk' + (steps ? ' open' : '')}>
        <button className="thkh" type="button" aria-expanded={steps}
          onClick={() => setSteps(v => !v)}>
          <span className="thksp" aria-hidden>✦</span>
          <span className="thkl">{secs ? `Assessed in ${secs}s` : 'Assessed'}</span>
          <span className="thkc" aria-hidden>⌄</span>
        </button>
        <div className="thkb"><div className="thkin">
          <span className="thkline" aria-hidden />
          <div className="thkrows">
            {rows.map((text, i) => (
              <div key={text} className="thkr done" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="thkri" aria-hidden />
                <span className="thkrt">{text}</span>
              </div>
            ))}
          </div>
        </div></div>
      </div>

      <div className="msg sys">
        <div className={'asscard' + (open ? ' open' : '')}>
          <button className="aschead" type="button" aria-expanded={open}
            onClick={() => setOpen(v => !v)}>
            <span className="ascsc num">{a.score}</span>
            <div className="ascm">
              <b>Trust Gate {a.score} · {a.passed}/{a.total} agree —{' '}
                {ok ? 'clear to proceed' : 'held for review'}</b>
              <span>{notes.length
                ? `${notes.length} note${notes.length > 1 ? 's' : ''} · ${
                  notes.map(v => v.agent).join(', ')} — recorded on the order, not blocking`
                : `All ${a.total} clean — nothing recorded`}</span>
            </div>
            <span className="ascx" aria-hidden>⌄</span>
          </button>
          {!open && (
            <div className="ascsum">
              {summary.map(([k, v]) => (
                <div className="ascr" key={k}><i /><span>{k}</span><em>{v}</em></div>
              ))}
            </div>
          )}
          {open && (
            <div className="ascbody">
              {/* Expanded shows all seven votes rather than a longer version of the four summary rows --
                  collapsed for the conclusion, expanded for what each agent individually said. */}
              <ul>
                {a.votes.map(v => (
                  <li key={v.agent} className={v.verdict === 'pass' ? '' : 'bnote'}>
                    <b>{v.agent}</b> — {v.note}
                  </li>
                ))}
              </ul>
              <b>Verdict:</b> {a.passed}/{a.total} agents approve (needs {a.threshold} of {a.total}).
              {notes.length
                ? ' The note rides with the order record and does not block release.'
                : ''}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
