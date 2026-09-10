import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import Avatar from '../components/Avatar'
import { IAttach, IMic, ISend } from '../components/icons'
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
            ? <Bubble key={x.msg.id} m={x.msg} />
            /* 工单卡不套页面外壳，直接进流。onBack 在这儿没有意义——
               卡就在会话里，没有「返回」这回事。 */
            : <OrderDetail key={x.order.id} id={x.order.id} bare onBack={() => {}} />))}
          {!stream.length && (
            <div className="msg sys"><span className="bub">
              Nothing here yet. Orders and messages with {name} land in this stream.
            </span></div>
          )}
          <div ref={end} />
        </div>
      </div>

      <div id="say">
        <div className="sayrow">
          <textarea id="free" rows={1} aria-label={`Message ${name}`}
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder={`Message ${name}`} />
          <div className="saytools">
            <button className="sayic" title="Attach" aria-label="Attach"><IAttach /></button>
            <button className="sayic" title="Voice" aria-label="Voice" aria-pressed={false}><IMic /></button>
            <button id="send" title="Send (Enter)" aria-label="Send"
              disabled={!text.trim() || busy} onClick={() => void send()}><ISend /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ m }: { m: Message }) {
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
  return (
    <div className={'msg ' + (m.author === 'me' ? 'me' : 'them')}>
      <span className="bub">{m.body}</span>
      <span className="mt">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
    </div>
  )
}
