import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import Avatar from '../components/Avatar'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'
import type { Account } from '../api/types'

/**
 * 联系人 = 可以付款的人。
 *
 * 三段，对应三个不同的问题：
 *   名册            我认识谁 —— 双方都点过头的
 *   等对方点头      我请求了谁 —— 加了，但对方还没确认，不能付
 *   等我点头        谁在请求我 —— 参照把这个放在左栏收件箱里；我们没有那一栏，
 *                   而请求总得有地方能接受，否则它永远停在 pending
 *
 * 单向加不成关系：加完是 pending，对方确认才是 accepted。不这么做的话
 * 「加了就能付」，而对方从头到尾没说过一句话。
 */
export default function Contacts({ identity }: { identity: string }) {
  const { data, reload } = useApi(() => ep.contacts(identity), [identity])
  /* 请求这一栏轮询：对方是在另一个浏览器里点的确认，不轮询就得手动刷新。 */
  const { data: reqs, reload: reloadReqs } =
    useApi(() => ep.contactRequests(identity), [identity], 5000)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')
  const list = data?.contacts ?? []
  const ok = list.filter(c => c.status !== 'pending')
  const pend = list.filter(c => c.status === 'pending')
  const inbox = reqs ?? []

  const accept = async (id: string) => {
    setBusy(id)
    try { await ep.acceptContact(id, identity); reloadReqs(); reload() }
    finally { setBusy('') }
  }

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
          <AddContact identity={identity}
            onClose={() => setAdding(false)}
            onDone={() => { setAdding(false); reload() }} />
        )}

        {/* 请求排在最上面：它是唯一一件等着我做的事，
            压在名册下面的话，人得先滚过一屏才看得到。 */}
        {inbox.length > 0 && (
          <>
            <div className="lsec">They want to connect</div>
            <div className="ctcard" style={{ marginBottom: 22 }}>
              {inbox.map(c => (
                <div className="ctrow pend" key={c.id}>
                  <Avatar name={c.name} cls="ctav" />
                  <span className="ctn"><em>{c.name}</em>
                    <i>{sub(c.label, c.address)}</i></span>
                  <span className="ctacts">
                    <button className="btn btn-primary btn-sm" disabled={busy === c.id}
                      onClick={() => void accept(c.id)}>
                      {busy === c.id ? 'Accepting…' : 'Accept'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {ok.length ? (
          <div className="ctcard">
            {ok.map(c => (
              <div className="ctrow" key={c.id} onClick={() => go({ view: 'thread', peer: c.id })}>
                <Avatar name={c.name} cls="ctav" />
                <span className="ctn">
                  <em>{c.name}</em>
                  <i>{sub(c.label, c.address)}</i>
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
        ) : !inbox.length && !pend.length ? (
          <div className="mkempty">No contacts yet — add someone to pay them.</div>
        ) : null}

        {pend.length > 0 && (
          <>
            <div className="lsec" style={{ marginTop: 22 }}>Waiting for them to accept</div>
            <div className="ctcard pend">
              {pend.map(c => (
                <div className="ctrow pend" key={c.id}>
                  <Avatar name={c.name} cls="ctav" />
                  <span className="ctn"><em>{c.name}</em>
                    <i>{sub(c.label, c.address)}</i></span>
                  <span className="ctled">Invite sent</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 加联系人。两个 tab，边打边搜。
 *
 * 搜索走后端 /accounts/search：名字模糊、地址精确。前端不从公开挂单里
 * 推——那只覆盖「此刻正在挂单的人」，一个真实存在但没挂单的账户会永远
 * 搜不到，而用户看到的是「查无此人」。谁存在是后端说了算。
 */
function AddContact({
  identity, onClose, onDone,
}: {
  identity: string
  onClose: () => void
  onDone: () => void
}) {
  const [tab, setTab] = useState<'find' | 'past'>('find')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Account[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const raw = q.trim()

  /* 边打边搜，250ms 收敛一次。每敲一个字发一次请求的话，回来的顺序不保证，
     后发的短查询会盖掉先发的长查询——列表就跟输入框对不上了。 */
  useEffect(() => {
    if (!raw) { setHits(null); return }
    let live = true
    const t = setTimeout(() => {
      ep.searchAccounts(raw, identity)
        .then(r => { if (live) setHits(r) })
        .catch(() => { if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [raw, identity])

  /* 「过去成交过的人」就是我成交过的对手方——从我自己的工单里来。
     从公开挂单里推的话，这一栏说的是「正在挂单的人」，跟标题不是一回事。 */
  const { data: mine } = useApi(() => ep.orders(identity), [identity])
  const past = Object.values(
    (mine ?? []).reduce<Record<string, { id: string; name: string; n: number }>>((a, o) => {
      const id = o.counterparty_id
      if (!id) return a
      a[id] ??= { id, name: o.counterparty_name ?? id, n: 0 }
      a[id].n++
      return a
    }, {}),
  )

  const send = async (query: string) => {
    setBusy(true); setErr('')
    try {
      await ep.addContact({ query, label: 'Client' }, identity)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add')
    } finally { setBusy(false) }
  }

  const looksAddr = /^0x[0-9a-fA-F]{0,40}$/.test(raw)

  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>Add contact</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
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
                  {!raw ? (
                    <p className="acnote">
                      Names match loosely — addresses must be exact.
                      They accept before you can pay them.
                    </p>
                  ) : hits === null ? (
                    <p className="acnote">Searching…</p>
                  ) : hits.length ? hits.map(a => {
                    /* 已经有关系的人照样列出来，但不给「添加」——按下去
                       只会拿到一个后端的报错，而错的是这个按钮不该在。 */
                    const rel = a.relation
                    return (
                      <button className="acrow" key={a.id} disabled={busy || !!rel}
                        onClick={() => { if (!rel) void send(a.address || a.name) }}>
                        <Avatar name={a.name} cls="cpav" />
                        <span className="n"><em>{a.name}</em>
                          <i>{a.deals ? `${a.deals} trades · score ${a.trust_score}` : shortAddr(a.address)}</i>
                        </span>
                        <span className="acgo">{
                          rel === 'accepted' ? 'Already a contact'
                            : rel === 'pending' ? 'Request sent'
                              : 'Add'
                        }</span>
                      </button>
                    )
                  }) : (
                    /* 地址是精确匹配，差一个字符就是查无此人——说清楚是哪一种，
                       比一句「没找到」有用：一个是打错了，一个是这人不在。 */
                    <p className="acnote">
                      {looksAddr && raw.length < 42
                        ? 'Keep typing — an address has to be complete to match.'
                        : `No account matches “${raw}”.`}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="acnote">People you have traded with but never added.</p>
                <div className="aclist">
                  {past.slice(0, 6).map(m => (
                    <button className="acrow" key={m.id} disabled={busy}
                      onClick={() => void send(m.name)}>
                      <Avatar name={m.name} cls="cpav" />
                      <span className="n"><em>{m.name}</em>
                        <i>{m.n} order{m.n > 1 ? 's' : ''} together</i></span>
                      <span className="acgo">Add</span>
                    </button>
                  ))}
                  {!past.length && (
                    <p className="acnote">
                      No one yet — people you have traded with show up here.
                      Use the other tab to add someone by name or address.
                    </p>
                  )}
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

const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * 副行：关系标签 · 地址。
 *
 * 标签可能是空的——接受请求的那一方从没说过对方是什么人，我们也不该替他
 * 编一个。空的时候连分隔点一起省掉，否则那行会以「· 0x24cd…」开头，
 * 看着像前面丢了一个字。
 */
const sub = (label: string, addr: string) =>
  [label, shortAddr(addr)].filter(Boolean).join(' · ')
