import { useState } from 'react'
import * as ep from '../api/endpoints'
import Avatar from '../components/Avatar'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'

/**
 * 联系人 = 可以付款的人。
 *
 * 一个字段收名字或地址，不做模糊搜索——那等于开放一个可以遍历用户的接口。
 */
export default function Contacts({ identity }: { identity: string }) {
  const { data, reload } = useApi(() => ep.contacts(identity), [identity])
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('Client')
  const [err, setErr] = useState('')
  const list = data?.contacts ?? []
  const rels = data?.relationships ?? ['Supplier', 'Client', 'Colleague', 'Friend', 'My agent']

  const add = async () => {
    if (!q.trim()) return
    setErr('')
    try {
      await ep.addContact({ query: q.trim(), label }, identity)
      setQ(''); setAdding(false); reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add')
    }
  }

  return (
    <div className="view on" id="v-contacts">
      <div className="vhead vhrow">
        <h2>Contacts</h2>
        <button className="btn btn-secondary" onClick={() => setAdding(a => !a)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M8 3.5v9M3.5 8h9" /></svg>
          Add contact
        </button>
      </div>
      <div className="vbody" id="cpbody">
        {adding && (
          <div className="ctcard" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <label className="acf">
              <span>Name or address</span>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void add() }}
                placeholder="Search a name, or paste an address"
                autoComplete="off" spellCheck={false} />
            </label>
            {/* 关系标签不是装饰：它决定新建条件单时预填哪套释放条件 */}
            <div className="sfchips">
              {rels.map(r => (
                <button key={r} type="button" className={'sfchip' + (label === r ? ' on' : '')}
                  onClick={() => setLabel(r)}>{r}</button>
              ))}
            </div>
            {err ? <span className="dnote">{err}</span> : null}
            <div className="dfoot">
              <button className="btn btn-primary btn-sm" onClick={() => void add()}>Send request</button>
            </div>
          </div>
        )}

        {list.length ? (
          <div className="ctcard">
            {list.map(c => (
              <div className="ctrow" key={c.id} onClick={() => go({ view: 'thread', peer: c.id })}>
                <Avatar name={c.name} cls="ctav" />
                <span className="ctn">
                  <em>{c.name}</em>
                  <i>{c.label} · {c.address ? `${c.address.slice(0, 6)}…${c.address.slice(-4)}` : ''}</i>
                </span>
                <span className="ctled num">
                  {c.deals ? `${c.deals} settled` : 'No trades yet'}
                </span>
                <span className="ctacts">
                  <button className="btn btn-secondary btn-sm"
                    onClick={e => { e.stopPropagation(); go({ view: 'thread', peer: c.id }) }}>
                    Message
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mkempty">No contacts yet — add someone to pay them.</div>
        )}
      </div>
    </div>
  )
}
