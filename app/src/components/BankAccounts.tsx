import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { useTradableFiats } from '../hooks/useRails'
import { BANKS, CTRY, CTRY_CCY } from './banks'
import { checkAcct, countryOfCurrency } from './acctfmt'
import { useToast } from './Toast'
import type { BankAccount } from '../api/types'

/**
 * Fiat receiving accounts: mine only.
 *
 * The fiat leg of OTC goes peer to peer through banks -- the account number is for the counterparty,
 * and the money never passes through Atara. The counterparty's bank details belong to that trade, not
 * to my address book, so they are not mixed in here. On-chain addresses are not here either: those are
 * a shortcut inside Send, which is a different question from "how do I receive fiat".
 *
 * One account per row, click through for detail, and edit and delete live only in the detail -- the
 * account number was copied in by hand, and neither editing nor deleting should be one click from a list.
 */

/* Which currencies an account may be in comes from the server, because the
   server is what clears them. This list was written into the page as
   CNY/HKD/USD/SGD/JPY while the backend settled only the first three: SGD and
   JPY were pickable and would never match anything, with nothing said. That
   is the same drift the rail catalogue was moved server-side to stop. */
const FALLBACK_CCY = ['CNY', 'HKD', 'USD']

interface Form {
  id: string
  holder: string
  bank: string
  no: string
  ccy: string
  region: string
  /** ISO alpha-2 of the bank picked from the catalogue; empty when typed freely. */
  country: string
}
const blank = (): Form => ({ id: '', holder: '', bank: '', no: '', ccy: 'CNY', region: '', country: '' })

// -- Bank combobox ------------------------------------------------------

/**
 * The bank is a searchable dropdown, but it **always keeps the free-text escape hatch**.
 * A dropdown that can stop a user entering their actual bank is a bug -- this table exists to save
 * typing, not as an authoritative register.
 */
function BankBox({
  value, ccy, onPick,
}: {
  value: string; ccy: string
  /** hit is the catalog entry that matched; null on free text. The layer above infers country and currency from it. */
  onPick: (v: string, hit: { n: string; c: string } | null) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('mousedown', away)
    return () => removeEventListener('mousedown', away)
  }, [])

  const q = value.trim().toLowerCase()
  /* An empty query should not show the first few banks in alphabetical order -- guessing the country from the currently selected currency is more useful */
  const hits = q
    ? BANKS.filter(x => `${x.n} ${x.a} ${CTRY[x.c] ?? ''}`.toLowerCase().includes(q)).slice(0, 8)
    : BANKS.filter(x => CTRY_CCY[x.c] === ccy).slice(0, 8)
  const exact = hits.some(x => x.n.toLowerCase() === q)

  return (
    <div className="cbox" ref={box}>
      <input type="text" value={value} role="combobox" aria-expanded={open}
        autoComplete="off" placeholder="Type to search — CMB, HSBC, 招商…"
        onFocus={() => setOpen(true)}
        onChange={e => { onPick(e.target.value, null); setOpen(true) }} />
      <div className="cblist" role="listbox" hidden={!open || !hits.length}>
        {hits.map(x => (
          <button type="button" className="cbrow" key={x.n} role="option"
            onMouseDown={e => { e.preventDefault(); onPick(x.n, x); setOpen(false) }}>
            <span className="cbn">{x.n}</span>
            <span className="cbc">{CTRY[x.c] ?? x.c}</span>
          </button>
        ))}
        {q && !exact && (
          <button type="button" className="cbrow cbfree"
            onMouseDown={e => { e.preventDefault(); setOpen(false) }}>
            <span className="cbn">Use “{value.trim()}”</span>
            <span className="cbc">Not listed</span>
          </button>
        )}
      </div>
    </div>
  )
}

// -- Delete confirmation ------------------------------------------------

/**
 * Confirmation for an irreversible action covers the whole screen, on top of the original modal, with
 * default focus on Cancel. As an inline note inside a card it would look like an aside, which does not
 * match "deleting this means copying the account number again".
 */
function Danger({
  title, body, ok, onOk, onClose,
}: { title: string; body: string; ok: string; onOk: () => void; onClose: () => void }) {
  return (
    <div id="danger">
      <div className="dgcard" role="dialog" aria-modal="true">
        <div className="dgic">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <path d="M12 8.5v5M12 16.8v.2" />
            <path d="M10.3 3.9 2.6 17.4A1.9 1.9 0 0 0 4.3 20.3h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="dgacts">
          <button className="btn btn-secondary" autoFocus onClick={onClose}>Cancel</button>
          <button className="btn btn-danger-solid" onClick={onOk}>{ok}</button>
        </div>
      </div>
    </div>
  )
}

// -- Main ---------------------------------------------------------------

export function BankAccountsPanel({ identity }: { identity: string }) {
  const { data: list, reload } = useApi(() => ep.bankAccounts(identity), [identity])
  const [view, setView] = useState<'list' | 'detail' | 'form'>('list')
  const [cur, setCur] = useState('')
  const [f, setF] = useState<Form>(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)
  /* Which field is wrong. The reference keeps the button always active and points out the problem on
     click -- rather than greying the button out: a grey button only says "no", not where the problem is,
     leaving the user to hunt field by field. It is worse on an empty form, where all four fields are
     blank and the button is grey from start to finish. */
  const [bad, setBad] = useState('')
  /* Whether the user has picked a currency themselves. Once they have, stop changing it for them --
     flipping the currency to HKD when a Hong Kong bank is selected is helpful, but flipping it back
     after they just picked USD by hand is arguing with them. */
  const [ccyTouched, setCcyTouched] = useState(false)
  /* Before the catalogue arrives, offer the currencies this version has always
     settled rather than an empty row — an empty row reads as "none", and the
     form would have no currency to save. */
  const fromServer = useTradableFiats()
  const CCY = fromServer.length ? fromServer : FALLBACK_CCY
  const { toast } = useToast()

  const rows = list ?? []
  const acct = rows.find(a => a.id === cur)
  /* Live check, for the hint only; the server runs the same rules before
     saving and that run is the one that counts (see acctfmt.ts). The country
     comes from the bank picked, else from the currency — a freely typed
     "ICBC" with CNY is still a mainland account. */
  const country = f.country || countryOfCurrency(f.ccy)
  const chk = checkAcct(f.no, country, f.bank)
  /* Whether the number field has been left once. Errors wait for that: every
     account number is "too short" while it is still being typed. Warnings and
     read-outs show at once — they are about what is there, not what is missing. */
  const [noLeft, setNoLeft] = useState(false)

  const save = async () => {
    // Validation order follows field order: point at the topmost one first, so the user can work downwards.
    if (!f.holder.trim()) { setBad('holder'); return }
    if (!f.bank.trim()) { setBad('bank'); return }
    // On edit, a blank account number means no change; on create it is required. Goes through checkAcct, the same rules as the live hints.
    // Only 'bad' blocks: a warning is a hint about something unusual, and the
    // person typing knows their own account better than the table does.
    if (!f.id && (chk.s === 'empty' || chk.s === 'bad')) { setBad('no'); return }
    if (f.id && f.no.trim() && chk.s === 'bad') { setBad('no'); return }
    if (!f.region.trim()) { setBad('region'); return }
    setBad('')
    setBusy(true); setErr('')
    try {
      const a = await ep.saveBankAccount({
        holder: f.holder.trim(), bank: f.bank.trim(), account_no: f.no,
        currency: f.ccy, region: f.region.trim(), country,
      }, f.id || undefined, identity)
      reload(); setCur(a.id); setView('detail')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally { setBusy(false) }
  }

  if (view === 'form') {
    return (
      <>
        {/* No header row above the fields. The sheet title already says where
            we are, and the Cancel button at the bottom is the way back, so the
            row was a second title with a second Cancel. */}
        <div className={'sf' + (bad === 'holder' ? ' bad' : '')}>
          <span className="sfl">Account holder</span>
          <input type="text" value={f.holder} placeholder="Name on the account"
            onChange={e => { setF({ ...f, holder: e.target.value }); setBad('') }} />
          <span className="err">Required</span></div>

        <div className={'sf' + (bad === 'bank' ? ' bad' : '')}>
          <span className="sfl">Bank</span>
          {/* Selecting a catalog entry brings the country and currency with it -- otherwise this dropdown
              only saves a few letters. The region is only filled when empty: if they already wrote
              "Shenzhen, CN", do not rewrite it to "China". */}
          <BankBox value={f.bank} ccy={f.ccy}
            onPick={(v, hit) => {
              const next = { ...f, bank: v, country: hit?.c ?? '' }
              if (hit) {
                if (!next.region.trim()) next.region = CTRY[hit.c] ?? hit.c
                const c = CTRY_CCY[hit.c]
                if (!ccyTouched && c && CCY.includes(c)) next.ccy = c
              }
              setF(next); setBad('')
            }} />
          <span className="err">Required</span></div>

        <div className={'sf' + (bad === 'no' ? ' bad' : '')}>
          <span className="sfl">Account number</span>
          <input type="text" className="mono" value={f.no} autoComplete="off" spellCheck={false}
            placeholder={f.id ? 'Retype it to change it' : 'Account number, or a full IBAN'}
            onBlur={() => setNoLeft(true)}
            onChange={e => {
              setF({ ...f, no: e.target.value }); setErr(''); setBad('')
              if (!e.target.value.trim()) setNoLeft(false)
            }} />
          <span className="err">{chk.msg ?? 'At least eight digits'}</span>
          {/* Live hint in three tones. The .err line above takes over when a
              save flags this field, so the hint steps aside then. */}
          {chk.msg && bad !== 'no' && (chk.s !== 'bad' || noLeft) ? (
            <span className={'cbhint ' + (chk.s === 'bad' ? 'no' : chk.s === 'warn' ? 'warn' : 'ok')}>
              {chk.msg}
            </span>
          ) : null}
        </div>

        <div className="sf"><span className="sfl">Currency</span>
          <div className="sfchips">
            {CCY.map(c => (
              <button key={c} type="button" className={'sfchip' + (f.ccy === c ? ' on' : '')}
                onClick={() => { setF({ ...f, ccy: c }); setCcyTouched(true) }}>{c}</button>
            ))}
          </div>
        </div>

        <div className={'sf' + (bad === 'region' ? ' bad' : '')}>
          <span className="sfl">Where the bank is</span>
          <input type="text" value={f.region} placeholder="Shenzhen, CN"
            onChange={e => { setF({ ...f, region: e.target.value }); setBad('') }} />
          <span className="err">Required</span></div>

        {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

        <div className="dfoot">
          <button className="btn backbtn" onClick={() => setView(f.id ? 'detail' : 'list')}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}
            onClick={() => void save()}>{f.id ? 'Save changes' : 'Add account'}</button>
        </div>
      </>
    )
  }

  if (view === 'detail' && acct) {
    return (
      <>
        <button type="button" className="wpicked" onClick={() => setView('list')}>
          <span className="pav">{acct.bank.slice(0, 2)}</span>
          <span className="anm"><b>{acct.bank}</b><em>{acct.currency} · {acct.region}</em></span>
          <span className="wachg">All accounts</span>
        </button>
        <dl className="sfsum sfsum-rows">
          <div><dt>Account holder</dt><dd>{acct.holder}</dd></div>
          <div><dt>Bank</dt><dd>{acct.bank}</dd></div>
          <div><dt>Account number</dt><dd className="mono">{acct.account_no}</dd></div>
          <div><dt>Currency</dt><dd>{acct.currency}</dd></div>
          <div><dt>Where the bank is</dt><dd>{acct.region}</dd></div>
        </dl>
        <p className="rnote">Only the last four digits are kept in the clear.</p>
        <div className="dfoot">
          <button className="btn btn-danger backbtn" onClick={() => setDel(true)}>Remove</button>
          <button className="btn btn-primary" onClick={() => {
            setF({ id: acct.id, holder: acct.holder, bank: acct.bank, no: '',
              ccy: acct.currency, region: acct.region, country: '' })
            // Editing an existing account: the currency is what they set back then, and picking a bank should not flip it.
            setBad(''); setCcyTouched(true); setView('form')
          }}>Edit</button>
        </div>
        {del && (
          <Danger title="Remove this account?"
            body={`${acct.bank} · ${acct.account_no}. The number is stored masked, so putting it back means typing it out again.`}
            ok="Remove"
            onClose={() => setDel(false)}
            onOk={async () => {
              try {
                await ep.deleteBankAccount(acct.id, identity)
                toast(`Removed ${acct.bank} · ${acct.account_no}`)
                setDel(false); setCur(''); setView('list'); reload()
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not remove that account', { kind: 'err' })
              }
            }} />
        )}
      </>
    )
  }

  return (
    <>
      <p className="fnote">
        <b>We never receive fiat.</b> These are your own bank accounts — you give the number
        to a counterparty, they pay your bank directly, and we verify the receipt.
      </p>
      <div className="plist">
        {rows.map(b => (
          <button type="button" className="prow prowgo" key={b.id}
            onClick={() => { setCur(b.id); setView('detail') }}>
            <span className="pav">{b.bank.slice(0, 2)}</span>
            <span className="ptxt"><b>{b.bank}<i className="ptag alt">{b.currency}</i></b>
              <em>{b.account_no} · {b.region}</em></span>
            <span className="wago" aria-hidden>›</span>
          </button>
        ))}
        {!rows.length && (
          <div className="fempty">No account yet — add one so a counterparty knows where to pay you.</div>
        )}
      </div>
      <button className="btn btn-sm"
        onClick={() => {
          setF(blank()); setErr(''); setBad(''); setCcyTouched(false); setView('form')
        }}>+ Add account</button>
    </>
  )
}

export type { BankAccount }
