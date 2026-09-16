import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import { IPanel } from './icons'
import { Constellation, Ring } from './Ring'
import { RISK_AGENTS, agentGlyph } from './agents'
import AgentProfile from './AgentProfile'
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
 * 右栏三块，顺序与 console.html 的 #rgrid 一致：
 * 订单状态 → agent 指标 → 评估。
 *
 * 栏顶不挂总标题：三块各自有名字，再挂一个会跟模块名重复。
 */
export default function RightPanel({
  identity, onOpen, onFold,
}: { identity: string; onOpen: (o: Order) => void; onFold: () => void }) {
  return (
    <aside id="right" className="lay-b" aria-label="Assessment and agent status">
      {/* 把手贴在这一栏的 border-left 上。放在栏里而不是放在 main 里，是因为
          收起、未登录这两种状态下右栏的 pointer-events/display 已经把它一起
          关掉了——放外面就得再写两条规则去追同一件事。 */}
      <PanelGrip />
      <div className="rgrid" id="rgrid">
        {/* DOM 顺序无所谓：grid-area 指定位置。
            lay-b 下 Assessment 吃掉 Agent status（后者 display:none），
            所以这里不渲染它——渲染了也看不见，只会多一次取数。 */}
        <Assessment onFold={onFold} />
        <OrderStatus identity={identity} onOpen={onOpen} />
      </div>
    </aside>
  )
}

type Filt = 'all' | 'you' | 'wait'

/* 卡上那句状态文案。由 phase + actor 拼出来——
   「谁在等谁」是这张卡唯一的重点，别的信息在工单页里。

   phase 为空是后端的设计：终态、条件支付、以及还没接单的 match 站都没有阶段。
   那几种情况按 console.html 的 OSTATE 兜底，措辞两边保持一致。 */
function label(o: Order): string {
  if (o.terminal === 'disputed') return 'In dispute — reviewing evidence'
  switch (o.phase) {
    case 'lock':   return 'Locking into escrow'
    case 'rel':    return 'Releasing to them'
    case 'pay':    return 'Send the transfer'
    case 'verify': return 'Verify their receipt'
    case 'wait':   return 'Waiting on their transfer'
  }
  // 还没接单：球在接单人手里
  if (o.state === 'match') return 'Needs your approval'
  return 'Waiting on the other side'
}

function OrderStatus({
  identity, onOpen,
}: { identity: string; onOpen: (o: Order) => void }) {
  const [filt, setFilt] = useState<Filt>('all')
  // 工单状态由后端调度器推进，不轮询就看不到变化。
  /* 15s as a backstop; the live stream is what normally refreshes this. Every
     order transition in the product publishes one, including the ones the
     scheduler makes while nobody is clicking anything — which is what this was
     polling for. */
  const { data, reload } = useApi(() => ep.orders(identity), [identity], 15000)

  useEffect(() => {
    addEventListener(LIVE_CHANGED, reload)
    return () => removeEventListener(LIVE_CHANGED, reload)
  }, [reload])
  const live = (data ?? []).filter(o => !o.terminal || o.terminal === 'disputed')

  /* 筛选只有两类值得分：球在我手里、球在别处。
     再细分成七种状态就成了选项迷宫——状态本来就写在每张卡上。 */
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
          /* 方向：轮到你的是要付出去的钱（−），等对方的是要进来的（+）。
             金额是这张卡的主角——扫一排卡就是扫「进出各多少」 */
          const mine = o.actor === 'you' || o.state === 'match'
          const tone = o.terminal === 'disputed' ? 'disp' : mine ? 'you' : 'run'
          const dir = tone === 'you' || tone === 'disp' ? 'out' : 'in'
          const amt = Math.round(Number(o.amount?.amount ?? 0))
          const who = o.counterparty_name ?? ''
          return (
            /* 点一张卡进这一单的会话，不是另开一个工单页。参照就是这么做的
               （restoreSession(t.sess) + switchView('chat')）。会话里有这一单
               完整的记录：当时那七票、工单卡、后来说过的每一句话。另开一页
               只能看到卡，看不到它是怎么来的。 */
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
        }) : (
          <div className="roempty">
            Nothing in flight. Payments you start show up here with what they are waiting on.
          </div>
        )}
      </div>
    </section>
  )
}

/** 四步骨架。空态也摆出来——用户能提前知道会经历什么，而不是看一句「什么都没跑」。 */
const IDLE_STEPS = ['Read the order', 'Collected evidence', 'Agent checks', 'Consensus']

/**
 * 评估。版式 B：上一排「环 | 星盘」，进度在下，候命排贴底。
 *
 * 空闲态的环只画不扫——「还没开始」和「0 分」看起来必须不一样。
 * 跑起来之后票一张一张落：七个一起转圈没有信息量，票本来就是一个一个落的。
 */
function Assessment({ onFold }: { onFold: () => void }) {
  /* 点名册里的 agent：整条 Assessment 换成它的档案页（arunAgentPane）。
     再点同一个或按 Back 回来。 */
  const [agent, setAgent] = useState<number | null>(null)
  /* 下面那一格显示哪一步的详情。空着就跟着「最后一个有详情、且已经开跑的步骤」
     走——刚跑到 agent checks 时看的是票，跑完了自动落到结论。人点过之后就听他的。 */
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

  /* 每个 agent 的状态：还没表态 = conferring（跑着）或 idle，表过态就封印。
  
     **按名字取，不按下标。** 后端现在发的就是界面上这七个名字。以前两边各
     有一套（Sanctions screening / Source of funds… 对 Identity / Provenance…），
     只能按下标配，而顺序一旦不同，Identity 那一格印的就是制裁那一票的理由——
     每句话都挂在错误的标题下，读的人无从发现。名字对齐之后这一整类问题没有了；
     万一哪天又对不上，取不到就是没表态，宁可空着也不显示别人的票。 */
  /* 哪几步有东西可看。read 只是「读过了」，pull 那一步的来源清单后端没发下来
     （只给了数量），所以这一版只有 agent checks 和 consensus 两步有详情。 */
  const hasDetail = (k: string) =>
    (k === 'check' && (run?.votes.length ?? 0) > 0) || (k === 'cons' && !!run?.done)
  /* 人点过就听他的；没点过跟着最后一个跑起来的、有详情的步骤走。 */
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
        {/* 收起右栏。常驻显示——原来它站在标题前面、静止时宽度为 0，
            非得把鼠标停在标题行上才露出来；要摸索才找得到的开关等于没有。
            改站行尾解决了当初把它藏起来的那个理由：它不再插在标题左边，
            Assessment 和下面的 Order status 自然对得齐。顺带重开按钮
            (.rshow) 也在右上角，收起和展开落在同一个位置。
            状态和视图级的 rout 分开记：rout 是「这个视图没有右栏」，
            rfold 是「用户自己收起来了」，两者不该互相覆盖。 */}
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
          {/* .rstats 在 lay-b 下是 display:none，星盘才是这一格的内容 */}
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
                            {/* 有详情的那几步才可点——点一个没有内容的步骤，
                                下面什么都不换，人会以为点坏了。 */}
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
                  {/* 点一行进那个 agent 的档案，跟点下面候命排是同一条路。 */}
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
 * 跑完之后的结论，一段说人话的话。
 *
 * 七票分成四个主题讲：身份和行为合成「对手方」，来源和图谱合成「资金」，
 * 制裁是「合规」，报价是「市场」。逐票念七遍没人读得完，而这四句正是
 * 下单的人真正在问的四件事。带 note 的那几票单独拎出来，说清为什么记下
 * 它却不拦——记下来和拦下来是两回事，混在一起人会以为这单出了问题。
 *
 * 成员按**后端那套名字**取，不按下标。下标对不上：RISK_AGENTS 是
 * Identity / Provenance / Graph / Sanctions / Behavior / Pricing / Velocity，
 * 而后端发的是 Sanctions screening / Source of funds / Counterparty history…
 * 两边都是七个，顺序却不同——按下标取会把制裁那一票印成「对手方」那一行，
 * 每句话都对不上它的理由，而读的人无从发现。
 *
 * 名字取不到就不出那一行，不拿别的凑数。
 */
/* 成员用的是后端现在发的那七个名字（= 界面上候命排那七个）。上一版写的是
   后端改名之前那套（Counterparty history / Source of funds…），改完名之后
   一个都匹配不上，于是这四行全空——而这段话只剩一个开头和一个结论，中间
   什么都没有。名字改在两处，得两处一起改。 */
const THEMES: [string, string[]][] = [
  ['Counterparty', ['Identity', 'Behavior']],
  ['Funds', ['Provenance', 'Graph']],
  ['Compliance', ['Sanctions']],
  ['Market', ['Pricing']],
]

function Verdict({ run }: { run: Run }) {
  const notes = run.votes.filter(v => v.v !== 'pass')
  const ok = run.votes.filter(v => v.v === 'pass').length
  const pass = ok >= run.threshold
  const noteOf = (n: string) => run.votes.find(v => v.n === n)?.note?.replace(/\.$/, '')

  return (
    <div className="arverd">
      <b>
        Trust score {run.score}/100 — {pass ? 'clear to proceed' : 'held for review'}.
      </b>{' '}
      Higher is safer. {run.total} agents scored this counterparty independently:
      <ul>
        {THEMES.map(([t, names]) => {
          const body = names.map(noteOf).filter(Boolean).join('; ')
          return body ? <li key={t}><b>{t}</b> — {body}.</li> : null
        })}
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

/** 相对时间。列表上只要「多久以前」，绝对时刻在工单页里。 */
function ago(iso?: string): string {
  if (!iso) return ''
  const s = Math.round((Date.now() - +new Date(iso)) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 60) return `${Math.max(s, 1)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
