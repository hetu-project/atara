import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import { IPanel } from './icons'
import { Constellation, Ring } from './Ring'
import { RISK_AGENTS, agentGlyph } from './agents'
import { useAssessment } from '../hooks/useAssessment'
import type { Run } from '../hooks/useAssessment'
import type { Order } from '../api/types'

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
  const { data } = useApi(() => ep.orders(identity), [identity], 2000)
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
  /* 点名册里的 agent 打开它的 profile。原来这些按钮没有 onClick，
     名字、职责、这一轮投了什么票，全都只能靠 title 悬停去看。 */
  const [agent, setAgent] = useState<number | null>(null)
  const { run, running } = useAssessment()

  /* 每个 agent 的状态：还没表态 = conferring（跑着）或 idle，表过态就封印。
     
     按序号对应，不按名字：后端那套名字（Sanctions screening / Source of funds…）
     是 mock 实现自己取的，前端这七个名字才是产品对外的身份。两边都是七个、
     同一顺序，索引是它们之间唯一稳定的关系。接真模型时应当由后端直接返回
     这七个名字，那时这里改回按名字匹配。 */
  const voteAt = (i: number) => run?.votes[i]
  const stateOf = (i: number): string => {
    const v = voteAt(i)
    if (v) return v.v
    return running ? 'conferring' : 'idle'
  }

  return (
    <section className="rmod" id="rm-feed">
      <div className="rmh">
        {/* 收起右栏。原来这颗按钮没有 onClick，点了完全没反应。
            状态和视图级的 rout 分开记：rout 是「这个视图没有右栏」，
            rfold 是「用户自己收起来了」，两者不该互相覆盖。 */}
        <button className="rfoldx" type="button" title="Collapse panel" aria-label="Collapse panel"
          onClick={onFold}>
          <IPanel mirror />
        </button>
        <h3>Assessment</h3>
        <span className={'aflive' + (running ? ' on' : '')}>
          <i /><em>{running ? 'running' : run?.done ? 'done' : 'idle'}</em>
        </span>
      </div>
      <div className="rmb">
        <div className="agtop" hidden />
        <div className="assplit">
          <div id="arring"><Ring score={run?.score ?? 0} runId={run?.id} /></div>
          {/* .rstats 在 lay-b 下是 display:none，星盘才是这一格的内容 */}
          <div className="rsplit">
            <div className="rtable" id="rs-table"><Constellation /></div>
          </div>
          <div className="asfade" />
        </div>
        <div className="aswrap">
          <div id="afruns">
            <div className={'arun open' + (run ? '' : ' aidle')}>
              {run ? (
                <>
                  <div className="arhead on">
                    <span className={'arhi ' + (run.flagged ? 'flag' : run.done ? 'ok' : 'run')} />
                    <span className="arht"><b>{run.subject}</b><i>{run.summary || 'Assessing…'}</i></span>
                  </div>
                  <div className="arsteps">
                    {run.steps.map(st => (
                      <div className={`arstep ${st.st}`} key={st.k}>
                        <span className="arsi"><i>{st.st === 'done' ? '✓' : ''}</i></span>
                        <div className="arsm">
                          <div className="arst">
                            <b>{st.n}</b>
                            {st.line ? <span className="arsl">{st.line}</span> : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 共识的过程，一票一行，落一个长一行。
                  
                      参照在这个版式下把「当前那一步的详情」摆进 .ardock，而
                      agent checks 那一步的详情就是这些行。原来这里只有一句
                      「Cleared · 6/7 agents agree」，而且要等全部跑完才出现——
                      中间那十几秒里右栏是空的，最该看的「他们在说什么」一个字
                      都没有。七票的分歧本来就是这块面板存在的理由。
                  
                      点一行进那个 agent 的底稿，跟点下面候命排是同一条路。 */}
                  {run.votes.length > 0 && (
                    <div className="ardock">
                      {run.votes.map((v, i) => (
                        <div className={`ardv ${v.v} can`} key={v.n}
                          role="button" tabIndex={0}
                          onClick={() => setAgent(i)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAgent(i) }
                          }}>
                          <b>{v.n.replace(/ Agent$/, '')}</b>
                          <span className="ardvv">{v.v}</span>
                          <span className="ardvx" aria-hidden>›</span>
                          <em>{v.note}</em>
                        </div>
                      ))}
                      {run.done && <Verdict run={run} />}
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
          </div>
        </div>
        <div className="roster" id="rs-roster">
          {RISK_AGENTS.map((a: { n: string; d: string }, i: number) => {
            const st = stateOf(i)
            const note = voteAt(i)?.note ?? ''
            /* sel 是「正在看这一个」，不是它的投票结果，所以单独挂一个类。
               原来点完只剩浏览器的 focus 环，而 focus 还把 hover 那套头像挤压
               动画一直开着——那个跳动读起来像「这一个在跑」，而它只是被选中了。
               参照是一个静态的框。 */
            return (
              <button type="button" className={`ragp ${st}${agent === i ? ' sel' : ''}`}
                key={a.n} title={note || `${a.n} · ${a.d}`}
                onClick={() => setAgent(i)}>
                <span className="ragav" dangerouslySetInnerHTML={{ __html: agentGlyph(i) }} />
                <span className="ragt">
                  <b>{a.n.replace(/ Agent$/, '')}</b>
                  {st === 'conferring' ? <i>comparing notes</i>
                    : st === 'pass' ? <i>pass</i>
                    : st === 'note' ? <i>pass · note</i>
                    : st === 'flag' ? <i>flagged</i> : null}
                </span>
              </button>
            )
          })}
        </div>
        <div id="afpanel" hidden />

        {/* Agent profile。参照里它占满整块 feed（.agpage），顶上的环和星盘收起——
            读 profile 的时候那些只是占地方的背景。 */}
        {agent !== null && (() => {
          const a = RISK_AGENTS[agent] as { n: string; d: string }
          const v = voteAt(agent)
          return (
            <div className="agpage">
              <header className="agph2">
                <span className="agcav" dangerouslySetInnerHTML={{ __html: agentGlyph(agent) }} />
                <div className="agid">
                  <b className="agpn">{a.n.replace(/ Agent$/, '')}</b>
                  <span className="agpr">{a.d}</span>
                </div>
                {v ? <span className="ardvv">{v.v}</span>
                   : <span className="agpidle">{running ? 'checking' : 'standing by'}</span>}
              </header>
              <div className="agsep" aria-hidden />
              <p className="agmeasure">
                {v?.note || 'No vote in this run yet — this agent has nothing to report.'}
              </p>
              <div className="dfoot">
                <button className="btn btn-ghost btn-sm" onClick={() => setAgent(null)}>Back</button>
              </div>
            </div>
          )
        })()}
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
const THEMES: [string, string[]][] = [
  ['Counterparty', ['Counterparty history', 'Dispute record']],
  ['Funds', ['Source of funds', 'Chain provenance']],
  ['Compliance', ['Sanctions screening', 'Document integrity']],
  ['Market', ['Velocity check']],
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
