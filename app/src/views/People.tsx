import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useAction, useApi } from '../hooks/useApi'
import { ErrorBox, PhaseChip } from '../components/bits'
import type { Contact, Message } from '../api/types'

/**
 * 对手方名录与会话。
 *
 * 一个对手方一条线程，聊天、订单卡、系统播报同流——交易的上下文和交易本身
 * 不该分在两个地方看。
 */
export default function People({ identity, onOpenOrder }: {
  identity: string
  onOpenOrder: (id: string) => void
}) {
  const [peer, setPeer] = useState<string | null>(null)

  return (
    <>
      <h1>People</h1>
      <p className="lede">
        加对手方只要一个字段——名字或地址都行，没有 ATR ID 这套东西。
        往来净额是跟这个人之间已完成订单的净流向，正数表示对方欠你。
      </p>
      <div className="grid two">
        <Contacts identity={identity} onPick={setPeer} picked={peer} />
        {peer
          ? <ThreadPane peer={peer} identity={identity} onOpenOrder={onOpenOrder} />
          : <div className="panel"><p className="muted">选一个对手方看会话。</p></div>}
      </div>
    </>
  )
}

function Contacts({ identity, onPick, picked }: {
  identity: string
  onPick: (id: string) => void
  picked: string | null
}) {
  const { data, error, reload } = useApi(() => ep.contacts(), [identity])
  const { run, pending, error: actErr } = useAction()
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('Supplier')

  const add = async () => {
    const r = await run(() => ep.addContact({ query: q, label }))
    if (r) { setQ(''); reload() }
  }

  return (
    <div className="panel">
      <h2>对手方</h2>
      <div className="row">
        <input type="text" placeholder="名字或地址" value={q} style={{ flex: 1, minWidth: 140 }}
          onChange={e => setQ(e.target.value)} aria-label="名字或地址" />
        <select value={label} onChange={e => setLabel(e.target.value)} aria-label="关系">
          {(data?.relationships ?? ['Supplier', 'Client', 'Colleague', 'Friend', 'My agent'])
            .map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn sm" onClick={add} disabled={pending || !q}>加入</button>
      </div>
      <ErrorBox error={actErr} />
      <ErrorBox error={error} />

      <div className="orders" style={{ marginTop: 16 }}>
        {data?.contacts.length === 0 && <p className="muted">名录是空的。</p>}
        {data?.contacts.map((c: Contact) => (
          <button className="ordrow" key={c.id} onClick={() => onPick(c.id)}
            style={picked === c.id ? { borderColor: 'var(--accent)' } : undefined}>
            <span className="chip them">{c.label}</span>
            <span className="ti">
              {c.nickname || c.name}
              <br />
              <span className="muted num" style={{ fontSize: 12.5 }}>
                {c.deals} 笔 · 履约 {c.fill_rate}%
                {c.net !== '0' && ` · 净额 ${c.net}`}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ThreadPane({ peer, identity, onOpenOrder }: {
  peer: string
  identity: string
  onOpenOrder: (id: string) => void
}) {
  // 2 秒轮询：对方发消息、系统播报状态变化都要能看到。
  const { data, error, reload } = useApi(() => ep.thread(peer), [peer, identity], 2000)
  const { run, pending } = useAction()
  const [body, setBody] = useState('')

  const send = async () => {
    const r = await run(() => ep.postChat(peer, body))
    if (r) { setBody(''); reload() }
  }

  return (
    <div className="panel">
      <h2>会话</h2>
      <ErrorBox error={error} />

      {data?.orders && data.orders.length > 0 && (
        <div className="orders" style={{ marginBottom: 16 }}>
          {data.orders.map(o => (
            <button className="ordrow" key={o.id} onClick={() => onOpenOrder(o.id)}>
              <span className="ref">{o.ref}</span>
              <span className="ti">
                {o.otc?.side === 'buy' ? '买入' : '卖出'} {o.amount.amount} {o.amount.asset}
              </span>
              <PhaseChip order={o} />
            </button>
          ))}
        </div>
      )}

      <ul className="events" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {data?.messages.length === 0 && <li className="muted">还没有消息。</li>}
        {data?.messages.map((m: Message) => (
          <li key={m.id} style={{ flexDirection: 'column', gap: 2 }}>
            <span className="st" style={{ minWidth: 0 }}>
              {m.author === 'me' ? '我' : m.author === 'system' ? '系统' : '对方'}
              {m.kind !== 'chat' && ` · ${m.kind}`}
            </span>
            <span style={{ color: m.kind === 'chat' ? 'var(--ink)' : 'var(--mute)' }}>
              {m.body}
            </span>
          </li>
        ))}
      </ul>

      <div className="row" style={{ marginTop: 12 }}>
        <input type="text" placeholder="说点什么" value={body} style={{ flex: 1 }}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && body) send() }}
          aria-label="消息" />
        <button className="btn sm" onClick={send} disabled={pending || !body}>发送</button>
      </div>
    </div>
  )
}
