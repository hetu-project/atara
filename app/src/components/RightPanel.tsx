import { Failed, Pending } from './Loading'
import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import { IPanel } from './icons'
import { Constellation, Ring } from './Ring'
import { RISK_AGENTS, agentGlyph } from './agents'
import AgentProfile from './AgentProfile'
import { fromRun, themeLines } from './assess'
import PanelGrip from './PanelGrip'
import { useAssessment } from '../hooks/useAssessment'
import type { Run } from '../hooks/useAssessment'
import type { Order } from '../api/types'

function agentIndex(n: string): number {
  const short = n.replace(/ Agent$/, '')
  return (RISK_AGENTS as { n: string }[]).findIndex(
    a => a.n === n || a.n.replace(/ Agent$/, '') === short,
  )
}

/**
 * Three blocks in the right column, in the same order as console.html's #rgrid:
 * order status -> agent metrics -> assessment.
 *
 * No overall heading at the top of the column: the three blocks have their own names, and another one would duplicate them.
 */
export default function RightPanel({
  identity, onOpen, onFold,
}: { identity: string; onOpen: (o: Order) => void; onFold: () => void }) {
  return (
    <aside id="right" className="lay-b" aria-label="Assessment and agent status">
      {/* The handle sits against this column's border-left. Inside the column rather than in main, because in the
          collapsed and signed-out states the right column's pointer-events/display already switch it off with
          everything else -- outside, two more rules would be needed chasing the same thing. */}
      <PanelGrip />
      <div className="rgrid" id="rgrid">
        {/* DOM order is irrelevant: grid-area places them.
            Under lay-b, Assessment absorbs Agent status (the latter is display:none), so it is not rendered here --
            rendering it would show nothing and only cost another fetch. */}
        <Assessment onFold={onFold} />
        <OrderStatus identity={identity} onOpen={onOpen} />
      </div>
    </aside>
  )
}

type Filt = 'all' | 'you' | 'wait'

/* The status line on the card. Assembled from phase + actor --
   "who is waiting on whom" is this card's only point; everything else is on the ticket page.

   An empty phase is by the backend's design: terminal states, conditional payments and the match stage before an
   order is taken all have no phase.
   Those cases fall back to console.html's OSTATE, with the wording kept identical on both sides. */
function label(o: Order): string {
  if (o.terminal === 'disputed') return 'In dispute — reviewing evidence'
  switch (o.phase) {
    case 'lock':   return 'Locking into escrow'
    case 'rel':    return 'Releasing to them'
    case 'pay':    return 'Send the transfer'
    case 'verify': return 'Verify their receipt'
    case 'wait':   return 'Waiting on their transfer'
  }
  // Not yet taken: the ball is with whoever takes it
  if (o.state === 'match') return 'Needs your approval'
  return 'Waiting on the other side'
}

function OrderStatus({
  identity, onOpen,
}: { identity: string; onOpen: (o: Order) => void }) {
  const [filt, setFilt] = useState<Filt>('all')
  // Ticket state is advanced by the backend scheduler; without polling, changes are invisible.
  /* 15s as a backstop; the live stream is what normally refreshes this. Every
     order transition in the product publishes one, including the ones the
     scheduler makes while nobody is clicking anything — which is what this was
     polling for. */
  const { data, error, reload } = useApi(() => ep.orders(identity), [identity], 15000)

  useEffect(() => {
    addEventListener(LIVE_CHANGED, reload)
    return () => removeEventListener(LIVE_CHANGED, reload)
  }, [reload])
  const live = (data ?? []).filter(o => !o.terminal || o.terminal === 'disputed')

  /* Only two filter values are worth distinguishing: the ball is with me, or it is elsewhere.
     Subdividing into seven states turns it into a maze of options -- the state is written on every card anyway. */
  const sets: Record<Filt, Order[]> = {
    all: live,
    you: live.filter(o => o.actor === 'you' || o.state === 'match' || o.terminal === 'disputed'),
    wait: live.filter(o => o.actor !== 'you' && o.state !== 'match' && o.terminal !== 'disputed'),
  }
  const on: Filt = sets[filt].length ? filt : 'all'
  const list = sets[on]

  return (
    <section className="rmod" id="rm-orders">
      <div className="rmh">
        <h3>Order status</h3>
        <span className="rmhfil">
          {live.length > 2 && (
            <div className="hfils">
              {(['all', 'you', 'wait'] as Filt[]).map(k => (
                <button key={k} className={'hfil' + (on === k ? ' on' : '')}
                  disabled={!sets[k].length} onClick={() => setFilt(k)}>
                  {k === 'all' ? 'All' : k === 'you' ? 'Needs you' : 'Waiting'}
                  <b className="num">{sets[k].length}</b>
                </button>
              ))}
            </div>
          )}
        </span>
      </div>
      <div className="rmb" id="ro-list">
        {list.length ? list.map(o => {
          /* Direction: your turn means money going out (-), waiting on them means money coming in (+).
             The amount is this card's subject -- scanning a row of cards is scanning "how much in and out" */
          const mine = o.actor === 'you' || o.state === 'match'
          const tone = o.terminal === 'disputed' ? 'disp' : mine ? 'you' : 'run'
          const dir = tone === 'you' || tone === 'disp' ? 'out' : 'in'
          const amt = Math.round(Number(o.amount?.amount ?? 0))
          const who = o.counterparty_name ?? ''
          return (
            /* Clicking a card opens that order's conversation, not a separate ticket page. That is what the
               reference does (restoreSession(t.sess) + switchView('chat')). The conversation holds the complete
               record of this order: the seven votes at the time, the ticket card, every word said since. A separate
               page shows only the card, not how it got there. */
            <button key={o.id} className={`rocard ${tone}`} onClick={() => onOpen(o)}>
              <span className="roc-st"><i />{label(o)}</span>
              {amt
                ? <b className={`roc-big num ${dir}`}>{dir === 'out' ? '−' : '+'}${amt.toLocaleString()}</b>
                : <b className="roc-big none">—</b>}
              <span className="roc-bot">
                {who ? <Avatar name={who} cls="roc-av" /> : null}
                {who ? <span className="roc-who">{who}</span> : null}
                <time>{ago(o.created_at)}</time>
              </span>
            </button>
          )
        }) : data === null ? (
          error ? <Failed error={error} onRetry={reload} compact /> : <Pending rows={2} />
        ) : (
          <div className="roempty">
            Nothing in flight. Payments you start show up here with what they are waiting on.
          </div>
        )}
      </div>
    </section>
  )
}

/** The four-step skeleton. Laid out in the empty state too -- the user gets to know in advance what is coming, rather than reading "nothing has run". */
const IDLE_STEPS = ['Read the order', 'Collected evidence', 'Agent checks', 'Consensus']

/**
 * Assessment. Layout B: "ring | constellation" on the top row, progress below, the standby roster along the bottom.
 *
 * In the idle state the ring is drawn without sweeping -- "not started yet" and "score 0" must not look the same.
 * Once running, votes land one at a time: seven spinners at once carry no information, and votes land one at a time by nature.
 */
function Assessment({ onFold }: { onFold: () => void }) {
  /* Clicking an agent in the roster: the whole Assessment block is replaced by its profile page (arunAgentPane).
     Click the same one again or press Back to return. */
  const [agent, setAgent] = useState<number | null>(null)
  /* Which step's detail the cell below shows. Left empty it follows "the last step that has detail and has
     started" -- at agent checks it shows the votes, and once finished it lands on the verdict. Once the user has clicked, follow them. */
  const [pick, setPick] = useState('')
  const { run, running } = useAssessment()
  const rosterRef = useRef<HTMLDivElement>(null)
  const runsRef = useRef<HTMLDivElement>(null)
  const [rosterMore, setRosterMore] = useState(false)
  const [runsMore, setRunsMore] = useState(false)

  useEffect(() => {
    const el = rosterRef.current
    if (!el) return
    const check = () => setRosterMore(el.scrollWidth - el.clientWidth > 8)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [agent, run?.done])

  useEffect(() => {
    const el = runsRef.current
    if (!el) return
    const check = () =>
      setRunsMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [agent, run, run?.votes.length])

  const openAgent = (i: number) => setAgent(cur => (cur === i ? null : i))
  const openAgentByName = (n: string) => {
    const i = agentIndex(n)
    if (i >= 0) openAgent(i)
  }

  /* Each agent's state: not yet spoken = conferring (running) or idle; once spoken it is sealed.

     **Keyed by name, not by index.** The backend now sends exactly the seven names shown in the UI. The two sides
     used to each have their own set (Sanctions screening / Source of funds... versus Identity / Provenance...),
     which could only be paired by index, and once the orders differed the Identity cell printed the sanctions
     vote's reasoning -- every sentence under the wrong heading, with no way for the reader to notice. Aligning the
     names removed this entire class of problem; and should they ever diverge again, a miss simply means "has not
     spoken", which is better left blank than showing someone else's vote. */
  /* Which steps have something to show. read only means "has been read", and the backend does not send the source
     list for the pull step (only a count), so in this version only agent checks and consensus have detail. */
  const hasDetail = (k: string) =>
    (k === 'check' && (run?.votes.length ?? 0) > 0) || (k === 'cons' && !!run?.done)
  /* Once the user has clicked, follow them; before that, follow the last started step that has detail. */
  const auto = [...(run?.steps ?? [])].reverse()
    .find(st => st.st !== 'wait' && hasDetail(st.k))?.k ?? ''
  const sel = hasDetail(pick) ? pick : auto

  const voteAt = (i: number) => {
    const name = RISK_AGENTS[i]?.n.replace(/ Agent$/, '')
    return run?.votes.find(v => v.n.replace(/ Agent$/, '') === name)
  }
  const stateOf = (i: number): string => {
    const v = voteAt(i)
    if (v) return v.v
    return running ? 'conferring' : 'idle'
  }

  return (
    <section className="rmod" id="rm-feed">
      <div className="rmh">
        <h3>Assessment</h3>
        <span className={'aflive' + (running ? ' on' : '')}>
          <i /><em>{running ? 'running' : run?.done ? 'done' : 'idle'}</em>
        </span>
        {/* Collapse the right column. Permanently visible -- it used to sit before the heading with zero width at
            rest, so it only appeared once the mouse rested on the heading row; a control you have to hunt for is
            no control at all.
            Moving it to the end of the row resolved the reason it was hidden in the first place: it no longer sits
            to the left of the heading, so Assessment lines up naturally with Order status below. Incidentally the
            reopen button (.rshow) is at the top right too, so collapsing and expanding happen in the same place.
            Its state is tracked separately from the view-level rout: rout means "this view has no right column",
            rfold means "the user collapsed it", and neither should override the other. */}
        <button className="rfoldx" type="button" title="Collapse panel" aria-label="Collapse panel"
          onClick={onFold}>
          <IPanel mirror />
        </button>
      </div>
      <div className="rmb">
        <div className="agtop" hidden={agent === null}>
          <button className="agback" type="button" onClick={() => setAgent(null)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
            Back
          </button>
          <span className="agth">Agent profile</span>
        </div>
        <div className="assplit">
          <div id="arring">
            {/* passed / threshold feed the line under the number, so it says
                how many actually agreed instead of a hardcoded N of N. */}
            <Ring score={run?.score ?? 0} runId={run?.id}
              passed={run?.votes.filter(v => v.v === 'pass').length}
              total={run?.threshold} />
          </div>
          {/* .rstats is display:none under lay-b; the constellation is this cell's content */}
          <div className="rsplit">
            <div className="rtable" id="rs-table"><Constellation live={!!run} done={!!run?.done} /></div>
          </div>
          <div className="asfade" />
        </div>
        <div className={'aswrap' + (runsMore ? ' more' : '')}>
          <div id="afruns" ref={runsRef}>
            {agent !== null ? (
              <AgentProfile i={agent} run={run} running={running} vote={voteAt(agent)} />
            ) : (
            <div className={'arun open' + (run ? '' : ' aidle')}>
              {run ? (
                <>
                  <div className="arhead on">
                    <span className={'arhi ' + (run.flagged ? 'flag' : run.done ? 'ok' : 'run')} />
                    <span className="arht"><b>{run.subject}</b><i>{run.summary || 'Assessing…'}</i></span>
                  </div>
                  <div className="arsteps">
                    {run.steps.map(st => {
                      const can = hasDetail(st.k)
                      return (
                        <div className={`arstep ${st.st}${sel === st.k ? ' open' : ''}`} key={st.k}>
                          <span className="arsi"><i>{st.st === 'done' ? '✓' : ''}</i></span>
                          <div className="arsm">
                            {/* Only steps with detail are clickable -- clicking one with no content changes nothing
                                below, and people assume it is broken. */}
                            <div className="arst" role={can ? 'button' : undefined}
                              tabIndex={can ? 0 : undefined}
                              onClick={can ? () => setPick(st.k) : undefined}
                              onKeyDown={can ? e => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(st.k) }
                              } : undefined}>
                              <b>{st.n}</b>
                              {st.line ? <span className="arsl">{st.line}</span> : null}
                              {can ? <span className="arsx" aria-hidden>⌄</span> : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Clicking a row opens that agent's profile, the same path as clicking the standby roster below. */}
                  {sel && (
                    <div className="ardock">
                      {sel === 'cons' ? <Verdict run={run} /> : run.votes.map(v => (
                        <div className={`ardv ${v.v} can`} key={v.n}
                          role="button" tabIndex={0}
                          onClick={() => openAgentByName(v.n)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault(); openAgentByName(v.n)
                            }
                          }}>
                          <b>{v.n.replace(/ Agent$/, '')}</b>
                          <span className="ardvv">{v.v}</span>
                          <span className="ardvx" aria-hidden>›</span>
                          <em>{v.note}</em>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="arsteps">
                    {IDLE_STEPS.map(n => (
                      <div className="arstep wait" key={n}>
                        <span className="arsi"><i /></span>
                        <div className="arsm"><div className="arst"><b>{n}</b></div></div>
                      </div>
                    ))}
                  </div>
                  <div className="ardock"><div className="asby">Standing by</div></div>
                </>
              )}
            </div>
            )}
          </div>
          <div className="asfade">
            <button className="asdn" type="button" aria-label="Scroll for more"
              onClick={() => runsRef.current?.scrollBy({ top: 160, behavior: 'smooth' })} />
          </div>
        </div>
        <div className={'roster' + (rosterMore ? ' more' : '')} id="rs-roster" ref={rosterRef}>
          {RISK_AGENTS.map((a: { n: string; d: string }, i: number) => {
            const st = stateOf(i)
            const note = voteAt(i)?.note ?? ''
            return (
              <button type="button" className={`ragp ${st}${agent === i ? ' sel' : ''}`}
                key={a.n} title={note || `${a.n} · ${a.d}`}
                aria-pressed={agent === i}
                onClick={() => openAgent(i)}>
                <span className="ragav" dangerouslySetInnerHTML={{ __html: agentGlyph(i) }} />
                <span className="ragt">
                  <b>{a.n.replace(/ Agent$/, '')}</b>
                  {st === 'conferring' ? <i>comparing notes</i>
                    : voteAt(i)?.sc ? <i>{voteAt(i)!.sc}</i>
                    : st === 'pass' ? <i>pass</i>
                    : st === 'note' ? <i>pass · note</i>
                    : st === 'flag' ? <i>flagged</i> : null}
                </span>
              </button>
            )
          })}
        </div>
        <div id="afpanel" hidden />
      </div>
    </section>
  )
}

/**
 * The verdict after a run, said in plain language.
 *
 * The seven votes are told as four themes: identity and behaviour combine into "counterparty", provenance and
 * graph into "funds", sanctions is "compliance", pricing is "market". Reciting seven votes one by one is more than
 * anyone will read, and these four are exactly the four questions the person placing the order is actually asking.
 * Votes carrying a note are pulled out separately, explaining why it was recorded but not blocked -- recording and
 * blocking are two different things, and merged together people assume something is wrong with the order.
 *
 * Members are keyed by **the backend's names**, not by index. The indices do not correspond: RISK_AGENTS is
 * Identity / Provenance / Graph / Sanctions / Behavior / Pricing / Velocity, while the backend sends
 * Sanctions screening / Source of funds / Counterparty history...
 * Both have seven, in different orders -- keyed by index, the sanctions vote would be printed on the
 * "counterparty" row, with every sentence mismatched to its reasoning and no way for the reader to notice.
 *
 * A name that cannot be found simply omits that row; nothing else is substituted for it.
 */
/* The theme map moved to assess.ts. It used to be declared here and again in AssessCard, and the comment that
   stood here warned that "the names live in two places and have to change in both" -- which is exactly what went
   wrong: this copy was updated after the backend's rename and the other was not. One copy now, and it compares
   names with the ` Agent` suffix stripped rather than exactly, so the next rename degrades to a missing line
   instead of an empty panel. */

function Verdict({ run }: { run: Run }) {
  const notes = run.votes.filter(v => v.v !== 'pass')
  const ok = run.votes.filter(v => v.v === 'pass').length
  const pass = ok >= run.threshold
  const themes = themeLines(fromRun(run))

  return (
    <div className="arverd">
      <b>
        Trust score {run.score}/100 — {pass ? 'clear to proceed' : 'held for review'}.
      </b>{' '}
      Higher is safer. {run.total} agents scored this counterparty independently:
      <ul>
        {themes.map(t => <li key={t.label}><b>{t.label}</b> — {t.body}.</li>)}
        {notes.map(v => (
          <li className="bnote" key={v.n}>
            <b>⚠ {v.n.replace(/ Agent$/, '')} — note</b>: {v.note}
          </li>
        ))}
      </ul>
      <b>Verdict:</b> {ok}/{run.total} agents approve (needs {run.threshold} of {run.total}).
      {notes.length > 0
        ? ' The note rides with the order record and does not block release.'
        : ''}
    </div>
  )
}

/** Relative time. A list only needs "how long ago"; the absolute moment is on the ticket page. */
function ago(iso?: string): string {
  if (!iso) return ''
  const s = Math.round((Date.now() - +new Date(iso)) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 60) return `${Math.max(s, 1)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
