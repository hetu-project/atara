import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import Avatar from '../components/Avatar'
import { IAttach, IMic, ISend } from '../components/icons'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'
import type { Message } from '../api/types'

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
          <span>{(data?.orders ?? []).length} orders together</span>
        </span>
      </div>

      <div id="log">
        <div className="tfeed">
          {msgs.map(m => <Bubble key={m.id} m={m} />)}
          {!msgs.length && (
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
