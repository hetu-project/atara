import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import Avatar from '../components/Avatar'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'
import { useToast } from '../components/Toast'
import type { Account } from '../api/types'
import { scoreText } from '../api/types'
import { Failed, Pending } from '../components/Loading'

/**
 * Contacts = people you can pay.
 *
 * Three sections, answering three different questions:
 *   Roster            who I know -- both sides have nodded
 *   Awaiting them     who I asked -- added, but not yet confirmed by them, so not payable
 *   Awaiting me       who is asking me -- the reference puts this in a left-column inbox; we have no
 *                     such column, and a request has to be acceptable somewhere or it stays pending forever
 *
 * A one-sided add does not make a relationship: adding leaves it pending, and only their confirmation
 * makes it accepted. Without that, "added means payable" while the other side never said a word.
 */
export default function Contacts({ identity }: { identity: string }) {
  const { data, error, reload } = useApi(() => ep.contacts(identity), [identity])
  /* 15s as a backstop; the live stream below is what normally refreshes these. */
  const { data: reqs, reload: reloadReqs } =
    useApi(() => ep.contactRequests(identity), [identity], 15000)

  /* Both lists, not just the inbox.
   *
   * The reasoning that put a timer on the inbox — the other side clicks in
   * another browser, so nothing here knows unless it asks — applies just as much
   * to the other direction, and that half had no timer at all: an invite you
   * sent stayed under "waiting for them to accept" until you reopened the page,
   * however long ago they said yes. */
  useEffect(() => {
    const again = () => { reload(); reloadReqs() }
    addEventListener(LIVE_CHANGED, again)
    return () => removeEventListener(LIVE_CHANGED, again)
  }, [reload, reloadReqs])
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

        {/* Requests come first: they are the only thing waiting on me, and buried under the roster
            people would have to scroll a screen to find them. */}
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
        ) : data === null ? (
          /* Not loaded is not "none": the empty state hands out an action
             (add someone) that is wrong while the list is still on its way. */
          error ? <Failed error={error} onRetry={reload} /> : <Pending rows={3} card />
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
 * Add a contact. Two tabs, search as you type.
 *
 * Search goes through the backend's /accounts/search: fuzzy on names, exact on addresses. The frontend
 * does not infer it from public listings -- that only covers "people with a listing right now", so a
 * genuinely existing account with no listing could never be found, and what the user sees is "no such
 * person". Who exists is the backend's call.
 */
function AddContact({
  identity, onClose, onDone,
}: {
  identity: string
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'find' | 'past'>('find')
  /* Which way the panel is moving, so the incoming content enters from the
     side the pill is travelling towards. Without it both panes always slide
     in from the same edge and a switch back reads as another switch forward.

     A ref, not state: it is read while rendering the very frame the tab
     changes on, and putting it in state would need a second render to take
     effect — by which point the animation has already started from the wrong
     side. It never needs to trigger a render of its own. */
  const dir = useRef(1)

  /* The panel's height, measured rather than declared.

     The two tabs are different heights and so is the search list as results
     come and go, and none of that is animatable on its own: `height:auto` and
     a grid `1fr` both just resolve to whatever the content needs, with no
     property changing for a transition to pick up. So the content is measured
     and the number is handed to CSS.

     One observer covers every cause — switching tabs, results arriving,
     results clearing — because it watches the content box rather than the
     thing that changed it. Undefined until the first measurement, which
     leaves the panel on `auto`: better an unanimated first paint than a
     clipped one. */
  const box = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<string>()
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(`${el.offsetHeight}px`))
    ro.observe(el)
    setH(`${el.offsetHeight}px`)
    return () => ro.disconnect()
  }, [])
  const go = (t: 'find' | 'past') => {
    if (t === tab) return
    dir.current = t === 'past' ? 1 : -1
    setTab(t)
  }
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Account[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const raw = q.trim()

  /* Search as you type, debounced at 250ms. One request per keystroke gives no ordering guarantee, and
     a later short query can overwrite an earlier long one -- leaving the list out of sync with the input. */
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

  /* "People I have traded with before" means counterparties I have settled with -- taken from my own
     tickets. Inferred from public listings, this column would mean "people with a listing", which is
     not what the heading says. */
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
      const c = await ep.addContact({ query, label: 'Client' }, identity)
      /* The sheet closes on success, so without this the click has no visible
         outcome at all — the dialog just disappears.

         Two outcomes, two sentences: adding someone is a request, unless they
         had already added us, in which case the backend accepts both sides at
         once and it is a contact right away. One generic message would be
         wrong half the time, and the wrong half is the one that says "waiting"
         about a relationship that is already live. */
      toast(
        c.status === 'accepted'
          ? `${c.name} is now a contact`
          : `Request sent to ${c.name} — they accept before you can pay them`,
        { kind: 'ok' },
      )
      onDone()
    } catch (e) {
      /* Errors stay inline: the sheet stays open on failure, so the message
         belongs next to the field that caused it, not in a corner of the page. */
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
          <div className="acbody">
            {/* --i drives the pill: 0 is the left segment, 1 the right. The
                position lives in CSS so the markup does not have to know how
                wide a segment is. */}
            <div className="acseg" role="tablist"
              style={{ '--i': tab === 'find' ? 0 : 1 } as CSSProperties}>
              <button className={'acs' + (tab === 'find' ? ' on' : '')} role="tab"
                aria-selected={tab === 'find'}
                onClick={() => go('find')}>By name or address</button>
              <button className={'acs' + (tab === 'past' ? ' on' : '')} role="tab"
                aria-selected={tab === 'past'}
                onClick={() => go('past')}>From past trades</button>
            </div>

            {/* The pane is keyed on the tab so React replaces it rather than
                patching it in place — the enter animation has to run against
                a fresh node, and a patched one would keep the old opacity.

                The grid wrapper carries the height change; the inner div is
                what the 0fr/1fr transition measures. */}
            <div className="acpanel" style={{ '--h': h } as CSSProperties}>
              <div ref={box}>
                <div className="acpane" key={tab}
                  style={{ '--d': dir.current } as CSSProperties}>
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
                    /* People already in a relationship are still listed, but without an Add button --
                       pressing it would only produce a backend error, and the error is that the button
                       should not be there. */
                    const rel = a.relation
                    return (
                      <button className="acrow" key={a.id} disabled={busy || !!rel}
                        onClick={() => { if (!rel) void send(a.address || a.name) }}>
                        <Avatar name={a.name} cls="cpav" />
                        <span className="n"><em>{a.name}</em>
                          <i>{a.deals
                            ? `${a.deals} trades · ${scoreText(a.trust_score)}`
                            : shortAddr(a.address)}</i>
                        </span>
                        <span className="acgo">{
                          rel === 'accepted' ? 'Already a contact'
                            : rel === 'pending' ? 'Request sent'
                              : 'Add'
                        }</span>
                      </button>
                    )
                  }) : (
                    /* Addresses match exactly, so one wrong character means no such person -- saying which
                       of the two it is beats "not found": one is a typo, the other is a person who is not here. */
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
                </div>
              </div>
            </div>

            {err ? <p className="acnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

/**
 * Sub-row: relationship label - address.
 *
 * The label may be empty -- the side that accepted a request never said who the other person is, and we
 * should not invent one for them. When empty, the separator dot is dropped along with it, otherwise the
 * line starts with "- 0x24cd..." and looks like a character went missing.
 */
const sub = (label: string, addr: string) =>
  [label, shortAddr(addr)].filter(Boolean).join(' · ')
