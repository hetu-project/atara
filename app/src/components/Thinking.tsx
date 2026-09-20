import { useEffect, useRef, useState } from 'react'
import { useAssessment } from '../hooks/useAssessment'

/**
 * 中栏那条评估痕迹。
 *
 * 与右栏的分工：这里是对话流里的一瞥（现在在做什么），右栏是留档（每一步的证据）。
 * 跑着的时候标题 shimmer、当前行转 spinner；跑完标题换成「Assessed in 14s」，
 * 收起来但还能再展开——结论出来之后过程仍然可查。
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

  /* 进行中和完成用两套措辞——「Reading the sources · reading sources…」
     这种把状态词和结论拼在一起，读起来是同一句话说两遍。 */
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
