import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { RISK_AGENTS } from '../components/agents'

export type StepState = 'wait' | 'run' | 'done'
export interface RunStep { k: string; n: string; st: StepState; line?: string }

/** One vote. verdict has three levels: pass / note (allowed but noted) / flag (a real objection). */
export interface Vote { n: string; v: 'pass' | 'note' | 'flag'; note: string; sc?: number }

export interface Run {
  id: string
  subject: string
  steps: RunStep[]
  votes: Vote[]
  score: number
  threshold: number
  total: number
  summary: string
  done: boolean
  flagged: boolean
}

/* The four steps are fixed, so the empty state should lay them out up front -- the user gets to know in advance what is coming. */
const STEPS: [string, string][] = [
  ['read', 'Read the order'], ['pull', 'Collected evidence'],
  ['check', 'Agent checks'], ['cons', 'Consensus'],
]
/** The gap between votes. Seven spinners at once carry no information; votes land one at a time by nature. */
const STEP_MS = 620

interface Ctx {
  run: Run | null
  running: boolean
  start: (offerId: string, subject: string, orderId?: string) => Promise<void>
  reset: () => void
}
const AssessmentCtx = createContext<Ctx>({
  run: null, running: false, start: async () => {}, reset: () => {},
})

export const useAssessment = () => useContext(AssessmentCtx)

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState<Run | null>(null)
  const [running, setRunning] = useState(false)
  const timers = useRef<number[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const reset = useCallback(() => { clear(); setRun(null); setRunning(false) }, [])

  /**
   * Kicks off an assessment.
   *
   * When orderId is given, replay **the copy stored against that order** rather than computing another
   * one. This matters: the backend scores from a seed, and the listing endpoint uses the listing id
   * while the ticket snapshot uses the ticket id -- two computations, two sets of numbers. And after
   * placing an order both appear on screen at the same time (the right column is running while the
   * card is already in the conversation stream), so one order showing two sets of scores can only
   * read as made up.
   *
   * The case with no orderId is "no order placed yet, just a look at this counterparty", which scores
   * off the listing id.
   */
  const start = useCallback(async (offerId: string, subject: string, orderId?: string) => {
    clear()
    const blank: Run = {
      id: `r-${Date.now()}`, subject,
      steps: STEPS.map(([k, n], i) => ({ k, n, st: i === 0 ? 'done' : i === 1 ? 'run' : 'wait' })),
      votes: [], score: 0, threshold: 6, total: RISK_AGENTS.length,
      summary: '', done: false, flagged: false,
    }
    setRun(blank)
    setRunning(true)

    let a: Awaited<ReturnType<typeof ep.assessment>>
    try {
      if (orderId) {
        const o = await ep.order(orderId)
        if (!o.assessment) throw new Error('no assessment on that order')
        a = o.assessment
      } else {
        a = await ep.assessment(offerId)
      }
    } catch {
      // If votes cannot be fetched, do not act one out: saying plainly that they are unavailable is more honest than inventing scores
      setRun(r => r && { ...r, done: true, summary: 'Could not reach the assessment service' })
      setRunning(false)
      return
    }

    /* The final value is fixed as soon as it arrives: the ring needs it to start, and walks its own
       pointer into place. The per-vote drip only drives the roster and the step bar -- those are the
       two places that need the "one at a time" rhythm. */
    setRun(r => r && { ...r, score: a.score, threshold: a.threshold, total: a.total })

    const votes: Vote[] = (a.votes ?? []).map(v => ({
      n: v.agent,
      v: v.verdict === 'pass' ? 'pass' : /note/i.test(v.note) ? 'note' : 'flag',
      note: v.note,
      // Each agent's own score, computed by the backend from the ticket id -- stable within an order, spread across different ones.
      sc: v.score,
    }))

    const step = (k: string, st: StepState, line?: string) =>
      setRun(r => {
        if (!r) return r
        const steps = r.steps.map(s => (s.k === k ? { ...s, st, line } : s))
        /* Once a step starts, everything before it counts as finished -- saves writing out the prerequisite states by hand in every place */
        const at = steps.findIndex(s => s.k === k)
        for (let i = 0; i < at; i++) {
          const prev = steps[i]
          if (prev && prev.st === 'wait') steps[i] = { ...prev, st: 'done' }
        }
        return { ...r, steps }
      })
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms) as unknown as number)

    at(320, () => step('pull', 'done', `${votes.length} sources`))
    at(420, () => step('check', 'run'))

    // Votes land one at a time. The score follows the votes that have landed; only the last one makes it final.
    votes.forEach((v, i) => {
      at(600 + i * STEP_MS, () => {
        setRun(r => r && { ...r, votes: [...r.votes, v] })
        step('check', 'run', `${i + 1}/${votes.length}`)
      })
    })

    const end = 600 + votes.length * STEP_MS
    at(end, () => {
      step('check', 'done', a.summary)
      step('cons', 'run')
    })
    /* start resolves only once the animation has finished: the caller has to wait for the conclusion
       before opening the ticket page. Dropping someone into the ticket page mid-assessment turns that
       card into a fait accompli. */
    await new Promise<void>(resolve => {
      at(end + 520, () => {
        step('cons', 'done', a.summary)
        setRun(r => r && {
          ...r, done: true, summary: a.summary, flagged: a.passed < a.threshold,
        })
        setRunning(false)
        resolve()
      })
    })
  }, [])

  const value = useMemo(() => ({ run, running, start, reset }), [run, running, start, reset])
  return <AssessmentCtx.Provider value={value}>{children}</AssessmentCtx.Provider>
}
