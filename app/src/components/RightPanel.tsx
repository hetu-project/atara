import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import { IPanel } from './icons'
import { Constellation, Ring } from './Ring'
import { RISK_AGENTS, agentGlyph } from './agents'
import { useAssessment } from '../hooks/useAssessment'
import type { Order } from '../api/types'

/**
 * 右栏三块，顺序与 console.html 的 #rgrid 一致：
 * 订单状态 → agent 指标 → 评估。
 *
 * 栏顶不挂总标题：三块各自有名字，再挂一个会跟模块名重复。
 */
export default function RightPanel({
  identity, onOpen,
}: { identity: string; onOpen: (id: string) => void }) {
  return (
    <aside id="right" className="lay-b" aria-label="Assessment and agent status">
      <div className="rgrid" id="rgrid">
        {/* DOM 顺序无所谓：grid-area 指定位置。
            lay-b 下 Assessment 吃掉 Agent status（后者 display:none），
            所以这里不渲染它——渲染了也看不见，只会多一次取数。 */}
        <Assessment />
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
}: { identity: string; onOpen: (id: string) => void }) {
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
            <button key={o.id} className={`rocard ${tone}`} onClick={() => onOpen(o.id)}>
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
function Assessment() {
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
        <button className="rfoldx" type="button" title="Collapse panel" aria-label="Collapse panel">
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
                  {run.done && (
                    <div className="ardock">
                      <div className="asby">
                        {run.flagged
                          ? 'Held for review — the gate did not clear'
                          : `Cleared · ${run.votes.filter(v => v.v === 'pass').length}/${run.total} agents agree`}
                      </div>
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
            return (
              <button type="button" className={`ragp ${st}`} key={a.n} title={note || `${a.n} · ${a.d}`}>
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
      </div>
    </section>
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
