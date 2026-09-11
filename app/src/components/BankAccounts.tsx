import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { BANKS, CTRY, CTRY_CCY } from './banks'
import type { BankAccount } from '../api/types'

/**
 * 法币收款账户：只有我自己的。
 *
 * OTC 的法币腿点对点走银行——账号是给对手方的，钱不经过 Atara。对手方的
 * 银行信息属于那笔交易，不属于我的账户簿，所以这里不混进来。链上地址也不在
 * 这儿：它是 Send 里的快捷选择，跟「怎么收法币」是两件事。
 *
 * 一行一个账户，点进去看详情，详情里才有编辑和删除——账号是手抄进来的，
 * 改和删都不该在列表上一键完成。
 */

const CCY = ['CNY', 'HKD', 'USD', 'SGD', 'JPY']

interface Form {
  id: string
  holder: string
  bank: string
  no: string
  ccy: string
  region: string
}
const blank = (): Form => ({ id: '', holder: '', bank: '', no: '', ccy: 'CNY', region: '' })

/** 本地即时校验，只为给出提示。落库前后端会再校一次——那一次才算数。 */
function checkAcct(raw: string): { s: 'empty' | 'ok' | 'bad'; msg?: string } {
  const v = raw.replace(/[\s-]/g, '').toUpperCase()
  if (!v) return { s: 'empty' }
  if (/^[A-Z]{2}\d{2}/.test(v)) {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) {
      return { s: 'bad', msg: 'An IBAN is 15–34 characters — check for a missing block' }
    }
    const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
    let m = 0
    for (const d of r) m = (m * 10 + Number(d)) % 97
    return m === 1
      ? { s: 'ok', msg: `IBAN checksum valid · ${CTRY[v.slice(0, 2)] ?? v.slice(0, 2)}` }
      : { s: 'bad', msg: 'IBAN checksum does not match — one character is wrong' }
  }
  if (/[^0-9]/.test(v)) {
    return { s: 'bad', msg: 'Digits only, or a full IBAN starting with a country code' }
  }
  if (v.length < 8) return { s: 'bad', msg: 'Too short — bank accounts are at least 8 digits' }
  if (v.length > 19) return { s: 'bad', msg: 'Too long — at most 19 digits' }
  return { s: 'ok' }
}

// ── 银行组合框 ──────────────────────────────────────────────────────

/**
 * 银行是可搜索的下拉，但**永远留着自由输入这条出口**。
 * 一个能拦住用户填自己真实银行的下拉框就是个 bug——这张表是省打字用的，
 * 不是权威登记册。
 */
function BankBox({
  value, ccy, onPick,
}: {
  value: string; ccy: string
  /** hit 是目录里命中的那一家；自由输入时为 null。上层据此推国家与币种。 */
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
  /* 空查询不该给一串按字母排的头几家——按当前选中的币种猜国家更有用 */
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

// ── 删除确认 ────────────────────────────────────────────────────────

/**
 * 不可逆操作的确认盖住整屏、盖在原弹窗之上，默认焦点落在「取消」。
 * 做成卡片里的一条提示，看起来和「顺便说一句」同级，配不上「删了要重抄账号」。
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

// ── 主体 ────────────────────────────────────────────────────────────

export function BankAccountsPanel({ identity }: { identity: string }) {
  const { data: list, reload } = useApi(() => ep.bankAccounts(identity), [identity])
  const [view, setView] = useState<'list' | 'detail' | 'form'>('list')
  const [cur, setCur] = useState('')
  const [f, setF] = useState<Form>(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)
  /* 哪一栏没填对。参照的做法是按钮常亮、点了才指出问题——
     而不是把按钮置灰：灰按钮只说「不行」，不说哪儿不行，人得自己
     一栏栏回去找。空表单上更糟，四栏都空着，按钮从头灰到尾。 */
  const [bad, setBad] = useState('')
  /* 用户自己点过币种没有。点过就不再替他改——选一家香港的银行把币种翻成
     HKD 是帮忙，但如果他刚刚亲手选了 USD，再翻回去就是跟他较劲。 */
  const [ccyTouched, setCcyTouched] = useState(false)

  const rows = list ?? []
  const acct = rows.find(a => a.id === cur)
  const chk = checkAcct(f.no)

  const save = async () => {
    // 校验顺序跟栏位顺序一致：先指出最上面那一个，人从上往下改就行。
    if (!f.holder.trim()) { setBad('holder'); return }
    if (!f.bank.trim()) { setBad('bank'); return }
    // 编辑时账号留空 = 不改；新增必须填。走 checkAcct，跟边填边提示同一套规则。
    if (!f.id && chk.s !== 'ok') { setBad('no'); return }
    if (f.id && f.no.trim() && chk.s !== 'ok') { setBad('no'); return }
    if (!f.region.trim()) { setBad('region'); return }
    setBad('')
    setBusy(true); setErr('')
    try {
      const a = await ep.saveBankAccount({
        holder: f.holder.trim(), bank: f.bank.trim(), account_no: f.no,
        currency: f.ccy, region: f.region.trim(),
      }, f.id || undefined, identity)
      reload(); setCur(a.id); setView('detail')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally { setBusy(false) }
  }

  if (view === 'form') {
    return (
      <>
        <button type="button" className="wpicked" onClick={() => setView(f.id ? 'detail' : 'list')}>
          <span className="pav">{f.id ? (f.bank.slice(0, 2) || '··') : '+'}</span>
          <span className="anm"><b>{f.id ? 'Edit account' : 'New account'}</b>
            <em>{f.id
              ? 'Changes apply the next time you hand out the number'
              : 'A counterparty will pay this account directly'}</em></span>
          <span className="wachg">Cancel</span>
        </button>

        <div className={'sf' + (bad === 'holder' ? ' bad' : '')}>
          <span className="sfl">Account holder</span>
          <input type="text" value={f.holder} placeholder="Name on the account"
            onChange={e => { setF({ ...f, holder: e.target.value }); setBad('') }} />
          <span className="err">Required</span></div>

        <div className={'sf' + (bad === 'bank' ? ' bad' : '')}>
          <span className="sfl">Bank</span>
          {/* 选中目录里的一家就把国家和币种带出来——不然这个下拉只省了几个
              字母。地区只在空着时填：人已经写了「Shenzhen, CN」就别改成「China」。 */}
          <BankBox value={f.bank} ccy={f.ccy}
            onPick={(v, hit) => {
              const next = { ...f, bank: v }
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
            onChange={e => { setF({ ...f, no: e.target.value }); setErr(''); setBad('') }} />
          <span className="err">{chk.msg ?? 'At least eight digits'}</span>
          {chk.msg && bad !== 'no' ? (
            <span className={chk.s === 'bad' ? 'err' : 'cbhint'}
              style={chk.s === 'bad' ? { display: 'block', color: 'var(--warn)' } : undefined}>
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
              ccy: acct.currency, region: acct.region })
            // 编辑已有账户：币种是他当初定的，不该被选银行这个动作翻掉。
            setBad(''); setCcyTouched(true); setView('form')
          }}>Edit</button>
        </div>
        {del && (
          <Danger title="Remove this account?"
            body={`${acct.bank} · ${acct.account_no}. The number is stored masked, so putting it back means typing it out again.`}
            ok="Remove"
            onClose={() => setDel(false)}
            onOk={async () => {
              await ep.deleteBankAccount(acct.id, identity)
              setDel(false); setCur(''); setView('list'); reload()
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
