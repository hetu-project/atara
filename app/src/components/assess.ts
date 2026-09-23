import type { Run } from '../hooks/useAssessment'
import type { OrderAssessment } from '../api/types'

/**
 * One shape for "an assessment", whichever end it came from.
 *
 * There are two sources and they are not the same object: a live `Run` (hooks/useAssessment, driven vote by vote
 * while it happens) and a stored `OrderAssessment` (api/types, the snapshot saved with the ticket). Every place
 * that wants to *show* an assessment had to know which of the two it held, and that is how the two copies of the
 * four-theme mapping drifted apart -- see THEMES below.
 */
export interface AssessView {
  score: number
  /** How many agreed. */
  passed: number
  total: number
  threshold: number
  votes: { name: string; v: 'pass' | 'note' | 'flag'; note: string }[]
  done: boolean
  /** Only the live side has one; the ring uses it to decide whether to restart its sweep. */
  runId?: string
}

/**
 * Agent names are compared with the suffix stripped.
 *
 * The backend has sent both `Identity` and `Identity Agent` at different times, and the frontend's own roster
 * (agents.ts RISK_AGENTS) carries the suffix. RightPanel's `voteAt` already normalises both sides this way; doing
 * the same here means a rename on either side degrades to "no note for that theme" rather than to a silently
 * empty panel.
 */
export const agentKey = (n: string): string => n.replace(/ Agent$/, '').trim().toLowerCase()

/**
 * The four themes the seven votes are told as, and which agents feed each.
 *
 * **This is the single copy.** There used to be two: RightPanel's THEMES (keyed on Identity / Provenance / …) and
 * AssessCard's SUMMARY (keyed on Counterparty history / Source of funds / …). The second set is the pre-rename
 * naming that RightPanel's own comments describe as matching nothing -- so AssessCard's four summary rows had been
 * resolving to an empty list. Reciting seven votes is more than anyone reads; these four are the questions someone
 * placing an order is actually asking.
 */
export const THEMES: { label: string; agents: string[] }[] = [
  { label: 'Counterparty', agents: ['Identity', 'Behavior'] },
  { label: 'Funds', agents: ['Provenance', 'Graph'] },
  { label: 'Compliance', agents: ['Sanctions'] },
  { label: 'Market', agents: ['Pricing'] },
]

/** One line per theme, built from whichever of its agents actually voted. Themes with nothing to say are dropped. */
export function themeLines(v: AssessView): { label: string; body: string }[] {
  const byKey = new Map(v.votes.map(x => [agentKey(x.name), x]))
  return THEMES
    .map(t => ({
      label: t.label,
      body: t.agents
        .map(n => byKey.get(agentKey(n))?.note?.replace(/\.$/, ''))
        .filter(Boolean)
        .join('; '),
    }))
    .filter(x => !!x.body)
}

/** Live run -> view. */
export const fromRun = (r: Run): AssessView => ({
  score: r.score,
  passed: r.votes.filter(v => v.v === 'pass').length,
  total: r.total,
  threshold: r.threshold,
  votes: r.votes.map(v => ({ name: v.n, v: v.v, note: v.note })),
  done: r.done,
  runId: r.id,
})

/**
 * Stored snapshot -> view.
 *
 * The snapshot only records pass/flag, so a note is recovered the same way the live side derives it (useAssessment
 * reads "note" out of the text). Without this every annotated pass would be redrawn as an objection.
 */
export const fromSnapshot = (a: OrderAssessment): AssessView => ({
  score: a.score,
  passed: a.passed,
  total: a.total,
  threshold: a.threshold,
  votes: a.votes.map(v => ({
    name: v.agent,
    v: v.verdict === 'pass' ? 'pass' : /note/i.test(v.note) ? 'note' : 'flag',
    note: v.note,
  })),
  done: true,
})
