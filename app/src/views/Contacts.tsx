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
  const list = data?.contacts ?? []



  return (
    <div className="view on" id="v-contacts">
      <div className="vhead vhrow">
        <h2>Contacts</h2>
        <button className="btn btn-secondary" onClick={() => setAdding(true)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M8 3.5v9M3.5 8h9" /></svg>
          Add contact
        </button>
      </div>
      <div className="vbody" id="cpbody">
        {adding && (
          <AddContact identity={identity} have={new Set(list.map(c => c.name))}
            onClose={() => setAdding(false)}
            onDone={() => { setAdding(false); reload() }} />
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


/**
 * 加联系人。结构逐处对齐参照的 openAddContact：两个 tab，边打边搜。
 *
 * 参照里没有关系标签的选择器，也没有「Send request」按钮——搜到人直接点
 * 那一行就发请求。原来我做成一张常驻表单，选完关系再点提交，比参照多两步，
 * 而且把「有哪些联系人」这个主体挤下去了。
 */
function AddContact({
  identity, have, onClose, onDone,
}: {
  identity: string
  have: Set<string>
  onClose: () => void
  onDone: () => void
}) {
  const [tab, setTab] = useState<'find' | 'past'>('find')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* 「过去成交过的人」在这套系统里就是挂单方——我们没有单独的成交对手表。 */
  const { data: offers } = useApi(() => ep.offers('buy'), [])
  const makers = (offers ?? [])
    .map(o => ({ name: o.maker.name, deals: o.maker.deals, score: o.maker.trust_score }))
    .filter((m, i, a) => a.findIndex(x => x.name === m.name) === i && !have.has(m.name))

  const send = async (query: string) => {
    setBusy(true); setErr('')
    try {
      await ep.addContact({ query, label: 'Client' }, identity)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add')
    } finally { setBusy(false) }
  }

  const raw = q.trim()
  const ADDR = /^(0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{25,40}|bc1[0-9a-z]{8,60})$/
  const partial = /^(0x|bc1|T[1-9])/.test(raw) && raw.length > 7 && !/\s/.test(raw)
  const hits = raw && !ADDR.test(raw) && !partial
    ? makers.filter(m => m.name.toLowerCase().includes(raw.toLowerCase())).slice(0, 6)
    : []

  const hint = (
    <p className="acnote">
      Names are public — addresses are not. They accept before you can pay them.
    </p>
  )

  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>Add contact</h3>
          <button className="sayic" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <div className="acx">
            <div className="acseg" role="tablist">
              <button className={'acs' + (tab === 'find' ? ' on' : '')} role="tab"
                onClick={() => setTab('find')}>By name or address</button>
              <button className={'acs' + (tab === 'past' ? ' on' : '')} role="tab"
                onClick={() => setTab('past')}>From past trades</button>
            </div>

            {tab === 'find' ? (
              <>
                <label className="acf"><span>Name or address</span>
                  <input type="text" autoFocus value={q} onChange={e => setQ(e.target.value)}
                    placeholder="Search a name, or paste an address"
                    autoComplete="off" spellCheck={false} />
                </label>
                <div className="aclist">
                  {!raw ? hint
                    : ADDR.test(raw) ? (
                      <button className="acrow" disabled={busy} onClick={() => void send(raw)}>
                        <Avatar name={raw} cls="cpav" />
                        <span className="n"><em className="num">{short(raw)}</em>
                          <i>New contact by address</i></span>
                        <span className="acgo">Send request</span>
                      </button>
                    )
                    /* 地址打了一半就搜名字，只会搜出一堆无关的人。
                       直说还差什么，比给一个空结果强。 */
                    : partial ? <p className="acnote">Keep typing — the full address is needed.</p>
                    : hits.length ? hits.map(m => (
                      <button className="acrow" key={m.name} disabled={busy}
                        onClick={() => void send(m.name)}>
                        <Avatar name={m.name} cls="cpav" />
                        <span className="n"><em>{m.name}</em>
                          <i>{m.deals} trades · score {m.score}</i></span>
                        <span className="acgo">Add</span>
                      </button>
                    ))
                    : <p className="acnote">No one by that name yet.</p>}
                </div>
              </>
            ) : (
              <>
                <p className="acnote">People you have settled with but never added.</p>
                <div className="aclist">
                  {makers.slice(0, 4).map(m => (
                    <button className="acrow" key={m.name} disabled={busy}
                      onClick={() => void send(m.name)}>
                      <Avatar name={m.name} cls="cpav" />
                      <span className="n"><em>{m.name}</em>
                        <i>{m.deals} trades · score {m.score}</i></span>
                      <span className="acgo">Add</span>
                    </button>
                  ))}
                  {!makers.length && <p className="acnote">Nothing to add yet.</p>}
                </div>
              </>
            )}

            {err ? <p className="acnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

const short = (a: string) => (a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a)
