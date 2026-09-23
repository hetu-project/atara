import { Ring, Constellation } from './Ring'
import { themeLines, type AssessView } from './assess'

/**
 * The assessment shown in full, inside the conversation.
 *
 * Until now this only existed in the right column, which phone widths do not render at all -- so the ring and the
 * constellation, the part of the product that shows the checking actually happened, were simply absent there. The
 * conversation already carried the step trace (Thinking, AssessCard); this is the rest of it.
 *
 * The markup targets the `.think*` rules that were already in console.css but that no React component had ever
 * used -- they came across with the stylesheet from console.html and were left orphaned, the same way `#ftoast`
 * was before the toast system was built. Reusing them means this is not a second visual language, and it inherits
 * their narrow-container behaviour for free: `.thagx` wraps and `.thnet` is `min-width:min(360px,100%)`, so the
 * ring and the constellation stack instead of overflowing.
 */
export default function AssessPanel({ v }: { v: AssessView }) {
  const themes = themeLines(v)
  const notes = v.votes.filter(x => x.v !== 'pass')
  const ok = v.passed >= v.threshold

  return (
    <div className="thpan">
      {/* Ring and constellation: the score it arrived at, and the seven that argued about it. */}
      <div className="thagx">
        <div className="thring">
          {/* No runId means this came from a stored snapshot, so the ring is drawn already finished rather
              than sweeping up from zero -- the assessment ran when the order was placed. */}
          <Ring score={v.score} runId={v.runId} passed={v.passed} total={v.threshold}
            settled={!v.runId} />
        </div>
        <div className="thnet">
          <Constellation live done={v.done} />
        </div>
      </div>

      {/* Per-agent rows. The four themes above are the reading; this is who actually said what. */}
      {v.votes.length > 0 && (
        <div className="thagents">
          {v.votes.map(x => (
            <div className={'tha' + (x.v === 'pass' ? '' : ' note')} key={x.name}>
              <i className="tk" aria-hidden>{x.v === 'pass' ? '✓' : '!'}</i>
              <b>{x.name.replace(/ Agent$/, '')}</b>
              <em>{x.note}</em>
            </div>
          ))}
        </div>
      )}

      <div className="thverdt">
        <b>Trust score {v.score}/100 — {ok ? 'clear to proceed' : 'held for review'}.</b>{' '}
        Higher is safer. {v.total} agents scored this counterparty independently:
        <ul>
          {themes.map(t => <li key={t.label}><b>{t.label}</b> — {t.body}.</li>)}
          {notes.map(x => (
            <li className="bnote" key={x.name}>
              <b>⚠ {x.name.replace(/ Agent$/, '')} — note</b>: {x.note}
            </li>
          ))}
        </ul>
        <b>Verdict:</b> {v.passed}/{v.total} agents approve (needs {v.threshold} of {v.total}).
        {notes.length > 0 ? ' The note rides with the order record and does not block release.' : ''}
      </div>
    </div>
  )
}
