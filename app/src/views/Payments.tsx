import { Fragment, useState } from 'react'
import * as ep from '../api/endpoints'
import Avatar from '../components/Avatar'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'
import type { Order } from '../api/types'

type Live = 'all' | 'you' | 'wait' | 'disp'
type Done = 'all' | 'Released' | 'Refunded'

/* 状态文案与右栏 Order status 同一套口径——两处写两遍就会各说各的 */
function label(o: Order): string {
  if (o.terminal === 'disputed') return 'In dispute — reviewing evidence'
  switch (o.phase) {
    case 'lock':   return 'Locking into escrow'
    case 'rel':    return 'Releasing to them'
    case 'pay':    return 'Send the transfer'
    case 'verify': return 'Verify their receipt'
    case 'wait':   return 'Waiting on their transfer'
  }
  if (o.state === 'match') return 'Needs your approval'
  return 'Waiting on the other side'
}
const toneOf = (o: Order) =>
  o.terminal === 'disputed' ? 'disp' : (o.actor === 'you' || o.state === 'match') ? 'you' : 'them'

/**
 * Payments = Order status 的全景。
 *
 * 一页两个 tab：进行中 / 已结束。同一种卡片语言——右栏那张放大一号；
 * 争议是进行中的二级状态，不是另一段流程。
 */
export default function Payments({ identity }: { identity: string }) {
  const [tab, setTab] = useState<'live' | 'fin'>('live')
  const [lf, setLf] = useState<Live>('all')
  const [df, setDf] = useState<Done>('all')
  const { data } = useApi(() => ep.orders(identity), [identity], 3000)

  const all = data ?? []
  const live = all.filter(o => !o.terminal || o.terminal === 'disputed')
  const done = all.filter(o => o.terminal && o.terminal !== 'disputed')

  const rank: Record<string, number> = { you: 0, disp: 1, them: 2 }
  const rows = [...live].sort((a, b) => (rank[toneOf(a)] ?? 2) - (rank[toneOf(b)] ?? 2))
  const lsets: Record<Live, Order[]> = {
    all: rows,
    you: rows.filter(o => toneOf(o) === 'you'),
    wait: rows.filter(o => toneOf(o) === 'them'),
    disp: rows.filter(o => toneOf(o) === 'disp'),
  }
  const lOn: Live = lsets[lf].length ? lf : 'all'

  const outcome = (o: Order) => (o.terminal === 'completed' ? 'Released' : 'Refunded')
  const dcounts: Record<Done, number> = {
    all: done.length,
    Released: done.filter(o => outcome(o) === 'Released').length,
    Refunded: done.filter(o => outcome(o) === 'Refunded').length,
  }
  const dOn: Done = dcounts[df] ? df : 'all'
  const dlist = dOn === 'all' ? done : done.filter(o => outcome(o) === dOn)

  return (
    <div className="view on" id="v-recs">
      <div className="vhead">
        <h2>Payments</h2>
        <p>The full view behind Order status — disputes stay in progress until they resolve.</p>
      </div>
      <div className="vbody" id="recsbody">
        <div className="atabs" role="tablist">
          <button className={'atab' + (tab === 'live' ? ' on' : '')} role="tab"
            aria-selected={tab === 'live'} onClick={() => setTab('live')}>
            In progress · <b className="num">{live.length}</b>
          </button>
          <button className={'atab' + (tab === 'fin' ? ' on' : '')} role="tab"
            aria-selected={tab === 'fin'} onClick={() => setTab('fin')}>
            Closed · <b className="num">{done.length}</b>
          </button>
        </div>

        {tab === 'live' ? (
          <>
            <div className="pbar">
              <div className="hfils">
                {([['all', 'All'], ['you', 'Needs you'], ['wait', 'Waiting'], ['disp', 'Disputed']] as [Live, string][])
                  .map(([k, lb]) => (
                    <button key={k} className={'hfil' + (lOn === k ? ' on' : '')}
                      disabled={!lsets[k].length} onClick={() => setLf(k)}>
                      {lb}<b className="num">{lsets[k].length}</b>
                    </button>
                  ))}
              </div>
            </div>
            {lsets[lOn].length ? (
              <div className="pgrid2">{lsets[lOn].map(o => <LiveCard key={o.id} o={o} />)}</div>
            ) : (
              <div className="pfempty">
                {lOn === 'all'
                  ? 'Nothing in progress. Every order you start shows up here until it closes.'
                  : 'Nothing in this state right now.'}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="pbar">
              <div className="hfils">
                {(['all', 'Released', 'Refunded'] as Done[]).map(k => (
                  <button key={k} className={'hfil' + (dOn === k ? ' on' : '')}
                    disabled={k !== 'all' && !dcounts[k]} onClick={() => setDf(k)}>
                    {k === 'all' ? 'All' : k}<b className="num">{dcounts[k]}</b>
                  </button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm">Export</button>
            </div>
            {/* 结束的单子是台账：一张表，一笔一行，每列各司其职 */}
            {dlist.length ? (
              <div className="led">
                <div className="ledr ledh">
                  <span>Date</span><span>Counterparty</span><span>Order</span>
                  <span className="r">Amount</span><span>Outcome</span><span />
                </div>
                {dlist.map(o => {
                  const d = new Date(o.created_at)
                  const out = outcome(o)
                  return (
                    <div className="ledr" key={o.id}>
                      <span className="ledd num">
                        {d.toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
                        <em>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</em>
                      </span>
                      <span className="ledw">{o.counterparty_name ?? '—'}</span>
                      <span className="ledt">{o.ref}</span>
                      <span className="leda num">
                        {Math.round(Number(o.amount.amount)).toLocaleString()} {o.amount.asset}
                      </span>
                      <span className={'leds' + (out !== 'Released' ? ' neg' : '')}><i />{out}</span>
                      <a href={`#/order/${o.id}`} className="lede lnk">Evidence</a>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="pfempty">No {dOn.toLowerCase()} settlements yet.</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LiveCard({ o }: { o: Order }) {
  const tone = toneOf(o)
  const dir = tone === 'you' || tone === 'disp' ? 'out' : 'in'
  const amt = Math.round(Number(o.amount.amount))
  const who = o.counterparty_name ?? ''
  const act = tone === 'you' ? 'Open' : tone === 'disp' ? 'See the case' : ''

  /* 托管三步：钱进合约 → 条件成立 → 放款。
     争议把第三步换成复核，不是新增一段流程——争议就发生在放款判定这一步上。 */
  const at = tone === 'disp' ? 2 : 1
  const steps: [string, number][] = [
    ['Funded', 0],
    [tone === 'you' ? 'Your call' : 'Condition', 1],
    [tone === 'disp' ? 'In review' : 'Release', 2],
  ]

  return (
    <div className={`pcard ${tone}`} role="button" tabIndex={0}
      onClick={() => go({ view: 'order', id: o.id })}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go({ view: 'order', id: o.id }) } }}>
      <span className="roc-st"><i />{label(o)}<time>{ago(o.created_at)}</time></span>
      {amt
        ? <b className={`roc-big num ${dir}`}>{dir === 'out' ? '−' : '+'}${amt.toLocaleString()}</b>
        : <b className="roc-big none">—</b>}
      <span className="pcard-t">{o.ref} · {o.amount.asset}</span>
      {/* 点和标签必须是 .ptrack 的直接子元素——套一层 span 就把间距规则打散了 */}
      <span className="ptrack">
        {steps.map(([lb, ix]) => (
          <Fragment key={lb}>
            <i className={ix < at ? 'done' : ix === at ? 'now' : ''} />
            <em className={ix === at ? 'now' : ''}>{lb}</em>
          </Fragment>
        ))}
      </span>
      <span className="pcard-f">
        {who ? <Avatar name={who} cls="roc-av" /> : null}
        {who ? <span className="roc-who">{who}</span> : null}
        {act ? (
          <button className={`btn btn-${tone === 'disp' ? 'secondary' : 'primary'} btn-sm`}
            onClick={e => { e.stopPropagation(); go({ view: 'order', id: o.id }) }}>{act}</button>
        ) : null}
      </span>
    </div>
  )
}

function ago(iso: string): string {
  const s = Math.round((Date.now() - +new Date(iso)) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 60) return `${Math.max(s, 1)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
