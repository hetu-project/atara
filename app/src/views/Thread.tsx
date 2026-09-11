import { Fragment, useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import ActionBar, { type Act, type ActKind } from '../components/ActionBar'
import { useAssessment } from '../hooks/useAssessment'
import AssessCard from '../components/AssessCard'
import Avatar from '../components/Avatar'
import { IAttach, IBuy, IMic, ISell, ISend } from '../components/icons'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'
import OrderDetail from './OrderDetail'
import type { Message, Order } from '../api/types'

/**
 * 一个对手方一条线程。
 *
 * 聊天、订单卡、系统播报共用同一条流——消息归人，状态归事，
 * 但它们出现在同一个地方。分成两个页面看的话，「他说发货了」和
 * 「这单还等着凭证」就永远对不上号。
 */
export default function Thread({ identity, peer }: { identity: string; peer: string }) {
  const { data, reload } = useApi(() => ep.thread(peer, identity), [peer, identity], 3000)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  /* 在这个人的会话里直接下单。参照的 composer 和会话本来就是同一个视图，
     所以这一排在对话里一直都在；我们拆成了两个视图，拆的时候把它落下了。
     而「正在跟这个人说话」恰恰是最该能直接下单的地方。 */
  const [act, setAct] = useState<Act | null>(null)
  const [err, setErr] = useState('')
  const { start } = useAssessment()
  const { data: cdata } = useApi(() => ep.contacts(identity), [identity])

  /* 对手方预填成「正在说话的这个人」——在他的会话里下单，不该再选一次。 */
  const mk = (k: ActKind): Act => ({
    k, amt: k === 'buy' ? 5000 : 3000, coin: 'USDT', fiat: 'CNY', peer: name, conds: [],
  })
  const end = useRef<HTMLDivElement>(null)
  const msgs = data?.messages ?? []
  const name = data?.peer?.display_name ?? peer
  const m = data?.merchant
  const orders = data?.orders ?? []

  /* 消息和工单卡按时间穿插在同一条流里。
  
     参照就是这么做的：工单卡（.deal）直接挂在 #log 下面，不是另开一页。
     分开的话，「他说钱打了」和「这单还等着凭证」永远对不上号——而这两件事
     本来就是同一件事的两面。 */
  const stream: ({ t: number } & ({ msg: Message } | { order: Order }))[] = [
    ...msgs.map(x => ({ t: Date.parse(x.created_at), msg: x })),
    ...orders.map(o => ({ t: Date.parse(o.created_at), order: o })),
  ].sort((a, b) => a.t - b.t)

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs.length])

  /* 对手方是写死的——你就在跟他说话。Home 那边要先撮合出一个人来，
     这里不用，也不该让人再选一次。 */
  const order = async (a: Act) => {
    setBusy(true); setErr('')
    try {
      const m = await ep.match({
        intent: a.k, amount: String(a.amt), amount_kind: 'coin',
        asset: a.coin, fiat: a.fiat, counterparty_id: peer,
      })
      if (m.violation) { setErr(m.violation.message); return }
      const pick = m.candidates?.[0]
      if (!pick) { setErr(`${name} has nothing live on that side right now`); return }
      const ord = await ep.take(pick.offer_id, {
        amount: pick.coin_amount, amount_kind: 'coin', network: '',
      })
      // 右栏回放这一单存下来的那份评估——见 useAssessment.start 的说明
      void start(pick.offer_id, pick.name, ord.id)
      setAct(null); reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open that order')
    } finally { setBusy(false) }
  }

  const send = async () => {
    const b = text.trim()
    if (!b || busy) return
    setBusy(true)
    try { await ep.postChat(peer, b, identity); setText(''); reload() }
    finally { setBusy(false) }
  }

  return (
    <div className="view on" id="v-chat">
      <div id="thhead" className="show">
        <Avatar name={name} cls="thav" />
        <span className="thwho">
          <b>{name}</b>
          {/* 参照这一行是对手方的成绩单：多少笔、多少分。「N orders together」
              说的是我跟他做过几单，那是另一个数，而且它已经在下面的流里了。 */}
          <span>
            {m ? `${m.deals} trades · score ${m.trust_score}` : 'No trades yet'}
          </span>
        </span>
      </div>

      <div id="log">
        <div className="tfeed">
          {stream.map(x => ('msg' in x
            ? <Bubble key={x.msg.id} m={x.msg} peer={name} />
            /* 工单卡不套页面外壳，直接进流。onBack 在这儿没有意义——
               卡就在会话里，没有「返回」这回事。
               风控卡排在工单卡前面：评估是在下单那一刻跑的，先有判断
               才有这一单，顺序反了就成了「先成交再审」。 */
            : (
              <Fragment key={x.order.id}>
                {x.order.assessment && <AssessCard a={x.order.assessment} peer={name} />}
                <OrderDetail id={x.order.id} bare onBack={() => {}} />
              </Fragment>
            )))}
          {!stream.length && (
            <div className="msg sys"><span className="bub">
              Nothing here yet. Orders and messages with {name} land in this stream.
            </span></div>
          )}
          <div ref={end} />
        </div>
      </div>

      <div id="say" className={act ? 'actopen' : ''}>
        <div id="actions" role="group" aria-label="Actions">
          <button className={'act' + (act?.k === 'buy' ? ' on' : '')}
            onClick={() => setAct(a => (a?.k === 'buy' ? null : mk('buy')))}>
            <span className="acti"><IBuy /></span>Buy
          </button>
          <button className={'act' + (act?.k === 'sell' ? ' on' : '')}
            onClick={() => setAct(a => (a?.k === 'sell' ? null : mk('sell')))}>
            <span className="acti"><ISell /></span>Sell
          </button>
        </div>
        {err ? <p className="roempty" style={{ textAlign: 'center' }}>{err}</p> : null}
        <div className="sayrow">
          {act && (
            <ActionBar act={act} onChange={setAct} onClose={() => setAct(null)}
              contacts={cdata?.contacts ?? []} />
          )}
          <textarea id="free" rows={1} aria-label={`Message ${name}`}
            value={text} onChange={e => setText(e.target.value)}
            /* 动作面板开着的时候回车是「下这一单」，不是发这句话——面板本身
               就是那句话，再把输入框里的内容当消息发一遍是发两次。 */
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (act) void order(act); else void send()
              }
            }}
            placeholder={act
              ? `Press Enter to place this order with ${name}`
              : `Message ${name}`} />
          <div className="saytools">
            <button className="sayic" title="Attach" aria-label="Attach"><IAttach /></button>
            <button className="sayic" title="Voice" aria-label="Voice" aria-pressed={false}><IMic /></button>
            <button id="send" title={act ? 'Place this order (Enter)' : 'Send (Enter)'}
              aria-label={act ? 'Place this order' : 'Send'}
              disabled={busy || (!act && !text.trim())}
              onClick={() => (act ? void order(act) : void send())}><ISend /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ m, peer }: { m: Message; peer: string }) {
  /* 系统播报不是谁说的话，居中不带气泡；订单卡点得开。 */
  if (m.kind === 'system' || m.kind === 'order') {
    const body = (
      <span className="bub">{m.body}</span>
    )
    return m.order_id ? (
      <div className="msg sys" role="button" tabIndex={0}
        style={{ cursor: 'pointer' }}
        onClick={() => go({ view: 'order', id: m.order_id! })}
        onKeyDown={e => { if (e.key === 'Enter') go({ view: 'order', id: m.order_id! }) }}>
        {body}
      </div>
    ) : <div className="msg sys">{body}</div>
  }
  const at = new Date(m.created_at)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  /* 对方的话带头像，自己的不带——参照就是这么分的，而且这么分是对的：
     一条流里只有一个「对方」，我自己是谁不需要每句话提醒一次。
     .mrow 把头像和气泡按底对齐；少了它，头像会跟着多行气泡拉长。 */
  if (m.author === 'me') {
    return (
      <div className="msg me">
        <span className="bub">{m.body}</span>
        <span className="mt">{at}</span>
      </div>
    )
  }
  return (
    <div className="msg them">
      <span className="mrow">
        <Avatar name={peer} cls="mav" />
        <span className="bub">{m.body}</span>
      </span>
      <span className="mt">{at}</span>
    </div>
  )
}
