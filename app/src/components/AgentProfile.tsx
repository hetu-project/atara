import { RISK_AGENTS, agentGlyph } from './agents'
import type { Run, Vote } from '../hooks/useAssessment'

/**
 * 单个 agent 的档案页。结构逐处对齐 console.html 的 arunAgentPane：
 * 顶上名片头（徽记 · 名字 · 判定 · 来源），下面按有没有跑过分内容——
 * 没跑过只留「它量什么」+ No reading yet；跑过了才出这一笔的读数和底稿。
 *
 * 底稿数据来自 RISK_AGENTS[i].ev，和参照同一份，不另编。
 */

type Src = { n: string; d: string }
type Hop = { n: string; d: string; t: string }
type Pair = [string, string]
type Ev = {
  pull?: string
  rec?: number
  srcs?: Src[]
  flow?: Hop[]
  checks?: Pair[]
  kv?: Pair[]
  raw?: string[]
}
type Agent = {
  n: string
  d: string
  v: string
  m?: string
  rz?: string
  ev: Ev
}

function short(n: string) {
  return n.replace(/ Agent$/, '')
}

function verdictClass(v: Vote['v'] | string | undefined): 'pass' | 'note' | 'flag' | '' {
  if (!v) return ''
  const s = String(v)
  if (/note/i.test(s) || s === 'note') return 'note'
  if (s === 'flag' || (/flag/i.test(s) && !/pass/i.test(s))) return 'flag'
  if (s === 'pass' || /^pass/i.test(s)) return 'pass'
  return ''
}

function badgeText(vote: Vote | undefined, fallback: string, done: boolean) {
  if (vote) {
    if (vote.v === 'note') return 'Pass · note'
    if (vote.v === 'flag') return 'Flag'
    return 'Pass'
  }
  return done ? fallback : ''
}

function Evid({ ev }: { ev: Ev }) {
  const srcs = ev.srcs ?? []
  const flow = ev.flow ?? []
  const kv = ev.kv ?? []
  const raw = ev.raw ?? []
  if (!srcs.length && !flow.length && !kv.length && !raw.length) return null
  return (
    <div className="afev">
      {srcs.length > 0 && (
        <section className="afsx">
          <h4 className="afsec">Where it looked</h4>
          {srcs.map(x => (
            <div className="afk" key={x.n}><b>{x.n}</b><em>{x.d}</em></div>
          ))}
        </section>
      )}
      {flow.length > 0 && (
        <section className="afsx">
          <h4 className="afsec">How the funds got here</h4>
          <div className="afflow">
            {flow.map(x => (
              <div className="afhop" key={x.n}>
                <i /><b>{x.n}</b><em>{x.d}</em><time>{x.t}</time>
              </div>
            ))}
          </div>
        </section>
      )}
      {kv.length > 0 && (
        <section className="afsx">
          <h4 className="afsec">What it found</h4>
          {kv.map(([k, v]) => (
            <div className="afc" key={k}><span>{k}</span><b>{v}</b></div>
          ))}
        </section>
      )}
      {raw.length > 0 && (
        <section className="afsx wide">
          <h4 className="afsec">Raw record</h4>
          <pre className="afraw">{raw.join('\n')}</pre>
        </section>
      )}
    </div>
  )
}

export default function AgentProfile({
  i, run, running, vote,
}: {
  i: number
  run: Run | null
  running: boolean
  vote?: Vote
}) {
  const a = RISK_AGENTS[i] as Agent | undefined
  if (!a) return null
  const ev = a.ev ?? {}
  const checks = ev.checks ?? []
  const hasRun = !!run
  const done = !!run?.done
  const cls = verdictClass(vote?.v) || (done ? verdictClass(a.v) : '')
  const votedText = badgeText(vote, a.v, done)
  const name = short(a.n)
  const blurb = a.m || a.rz || ''

  return (
    <div className={`agpage ${cls}`.trim()}>
      <header className="agph2">
        <span className="agcav" dangerouslySetInnerHTML={{ __html: agentGlyph(i) }} />
        <div className="agid">
          <b className="agpn">{name}</b>
          <span className="agpr">{a.d}</span>
        </div>
        {votedText
          ? <span className="ardvv">{votedText}</span>
          : <span className="agpidle">{running ? 'checking' : 'standing by'}</span>}
        {hasRun && ev.pull ? (
          <span className="agsrc">
            {ev.pull}
            {ev.rec ? <>{' · '}<b className="num">{ev.rec.toLocaleString()}</b> records</> : null}
          </span>
        ) : null}
      </header>

      {hasRun ? (
        checks.length > 0 ? (
          <div className="agmline">
            <span>Measures</span>
            {checks.map(([k]) => k).join(' · ')}
          </div>
        ) : null
      ) : (
        checks.length > 0 ? (
          <div className="agmeasure">
            <h4 className="afsec">What it measures</h4>
            <div className="agtags">
              {checks.map(([k]) => <span className="agtag" key={k}>{k}</span>)}
            </div>
          </div>
        ) : null
      )}
      <div className="agsep" aria-hidden="true" />

      <section className="agwork">
        {hasRun ? (
          <>
            <h4 className="afsec">On this payment</h4>
            {votedText && blurb ? <p className="agpm">{blurb}</p> : null}
            {checks.length > 0 && (
              <div className="agcks">
                {checks.map(([k, v]) => {
                  const pct = /^(\d+(?:\.\d+)?)%$/.exec(String(v))
                  return (
                    <div className="agck" key={k}>
                      <i className={'agdot' + (votedText ? '' : ' dim')} />
                      <span>{k}</span>
                      <b>{v}</b>
                      {pct ? (
                        <i className="agmeter">
                          <b style={{ width: `${Math.min(100, Number(pct[1] ?? 0))}%` }} />
                        </i>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
            <Evid ev={ev} />
          </>
        ) : (
          <div className="agnone">
            <b>No reading yet</b>
            <em>{name} runs when an order is opened. Its findings on that payment show up here.</em>
          </div>
        )}
      </section>
    </div>
  )
}
