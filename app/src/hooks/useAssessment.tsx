import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { RISK_AGENTS } from '../components/agents'

export type StepState = 'wait' | 'run' | 'done'
export interface RunStep { k: string; n: string; st: StepState; line?: string }

/** 一票。verdict 三档：pass / note（放行但记一笔）/ flag（真反对）。 */
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

/* 四步是固定的，空态就该先摆出来——用户能提前知道会经历什么。 */
const STEPS: [string, string][] = [
  ['read', 'Read the order'], ['pull', 'Collected evidence'],
  ['check', 'Agent checks'], ['cons', 'Consensus'],
]
/** 每票之间的间隔。七个一起转圈没有信息量，票本来就是一个一个落的。 */
const STEP_MS = 620

interface Ctx {
  run: Run | null
  running: boolean
  start: (offerId: string, subject: string) => Promise<void>
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

  const start = useCallback(async (offerId: string, subject: string) => {
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
      a = await ep.assessment(offerId)
    } catch {
      // 取不到票就别演一段假的：说清楚拿不到，比编一组分数诚实
      setRun(r => r && { ...r, done: true, summary: 'Could not reach the assessment service' })
      setRunning(false)
      return
    }

    /* 终值一拿到就定下来：环要用它起跑，自己把指针走到位。
       逐票只驱动 roster 和步骤条——那两处才需要「一张一张」的节奏。 */
    setRun(r => r && { ...r, score: a.score, threshold: a.threshold, total: a.total })

    const votes: Vote[] = (a.votes ?? []).map(v => ({
      n: v.agent,
      v: v.verdict === 'pass' ? 'pass' : /note/i.test(v.note) ? 'note' : 'flag',
      note: v.note,
    }))

    const step = (k: string, st: StepState, line?: string) =>
      setRun(r => {
        if (!r) return r
        const steps = r.steps.map(s => (s.k === k ? { ...s, st, line } : s))
        /* 一步开跑，它前面的都算结了——省得每处都手写一遍前置状态 */
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

    // 票一张一张落。分数跟着已落的票走，最后一票落定才是终值。
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
    /* start 在动画跑完才 resolve：调用方要等结论出来再开工单页。
       评估没跑完就把人甩进工单页，那张卡就成了既成事实。 */
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
