import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { FX_IDX } from './kycforms'
import { useTradableFiats } from '../hooks/useRails'
import type { BankAccount } from '../api/types'
import { BankAccountsModal } from './WalletModals'

/**
 * 挂单配置的表单，逐处对着参照的 paintMaker() 里 phase==='listing' 那一支写。
 *
 * 这一段不走 KYC 那套「一个字段定义驱动一行」的通用渲染：限额是一行两个框、
 * 定价的输入随着选中的模式换意思、渠道是个分组多选菜单——用通用渲染写出来
 * 就不是这张表单了。
 *
 * 这些条款是能力级的：它圈定以后每一次挂单的可选范围，所以在这儿定一次，
 * 不是每次挂单重填。
 */

export interface Listing {
  dir: string[]
  coins: string[]
  lo: string
  hi: string
  nets: string[]
  pricing: 'Float' | 'Fixed'
  spread: string
  fixed: string
  rails: string[]
  agree: boolean
}

export const blankListing = (): Listing => ({
  dir: [], coins: [], lo: '', hi: '', nets: [], pricing: 'Float',
  spread: '0.8', fixed: '', rails: [], agree: false,
})

const num = (v: string) => Number(String(v).replace(/[,，\s]/g, ''))

/** 校验规则逐条取自参照的 sellerValid()。返回出错那一行的 id，全对返回空。 */
export function badListingField(d: Listing, step: number): string {
  if (step === 0) {
    if (!d.dir.length) return 'sf-dir'
    if (!d.coins.length) return 'sf-coins'
    const lo = num(d.lo), hi = num(d.hi)
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0 || lo > hi) return 'sf-limit'
    if (!d.nets.length) return 'sf-nets'
    if (d.pricing === 'Float') {
      const sp = parseFloat(String(d.spread).replace(/[%\s]/g, ''))
      if (!Number.isFinite(sp) || sp < -5 || sp > 5) return 'sf-pricing'
    } else {
      const fx = num(d.fixed)
      if (!Number.isFinite(fx) || fx <= 0) return 'sf-pricing'
    }
    if (!d.rails.length) return 'sf-rails'
  }
  if (step === 1 && !d.agree) return 'sf-agree'
  return ''
}

const Chips = ({
  opts, sel, onPick,
}: { opts: string[]; sel: string[]; onPick: (v: string) => void }) => (
  <div className="sfchips">
    {opts.map(o => (
      <button key={o} type="button" className={'sfchip' + (sel.includes(o) ? ' on' : '')}
        onClick={() => onPick(o)}>{o}</button>
    ))}
  </div>
)

/**
 * Which of my own fiat accounts receive the money.
 *
 * This used to be a global bank directory: picking "ICBC" declared that I
 * accept ICBC transfers, and that was the end of it. The account it implied
 * lived in a different drawer — or nowhere — so no counterparty could ever be
 * told where to send the money, and nothing checked that the two agreed.
 *
 * A rail is the account. There is no separate claim left to contradict.
 *
 * Ticking does not close the panel — that is what multi-select should feel
 * like; clicking outside closes it.
 */
function AccountMenu({
  identity, sel, onToggle,
}: { identity: string; sel: string[]; onToggle: (v: string) => void }) {
  const { data: list, reload } = useApi(() => ep.bankAccounts(identity), [identity])
  const tradable = useTradableFiats()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('mousedown', away)
    return () => removeEventListener('mousedown', away)
  }, [open])

  const rows = list ?? []
  const byID = new Map(rows.map(a => [a.id, a]))
  const picked = sel.map(id => byID.get(id)).filter(Boolean) as BankAccount[]
  /* Terms saved before rails were accounts hold bank names, and an account can
     be deleted after the terms referenced it. Both read the same way here —
     this row no longer points anywhere — so say how many rather than which. */
  const gone = sel.filter(id => !byID.has(id))

  return (
    <>
      <div ref={box} style={{ position: 'relative' }}>
        {/* The chosen accounts sit in the trigger as chips, each with its own
            remove control. Unpicking one used to mean opening the panel and
            hunting for the row — and changing which account gets paid is the
            main reason anyone comes back to these terms at all.

            A div, not a button: the chips are buttons, and a button inside a
            button is neither valid nor clickable. The opener below is a real
            button that fills the rest of the row, so the blank area still
            opens the panel and the keyboard still reaches everything. */}
        <div className={'sfdd sfdd-tok' + (open ? ' on' : '')}>
          {picked.map(a => (
            <span className="tok" key={a.id}>
              {a.bank}
              <button type="button" className="tokx" aria-label={`Remove ${a.bank}`}
                onClick={() => onToggle(a.id)}>×</button>
            </span>
          ))}
          {gone.length > 0 && (
            <span className="tok tokgone">
              {gone.length} no longer on file
              <button type="button" className="tokx" aria-label="Remove accounts no longer on file"
                onClick={() => gone.forEach(onToggle)}>×</button>
            </span>
          )}
          <button type="button" className="tokopen" aria-expanded={open}
            onClick={() => setOpen(o => !o)}>
            <span>{sel.length ? '' : 'Choose which of your accounts receive the money…'}</span>
            <i>⌄</i>
          </button>
        </div>
        {open && (
          <div className="ddmenu railmenu">
            {rows.map(a => {
              /* An account in a currency we cannot settle is selectable
                 nowhere — it is the applicant's real account, so it is listed,
                 but saying why it cannot be used beats leaving them to wonder
                 where their bank went. */
              const off = tradable.length > 0 && !tradable.includes(a.currency)
              return (
                <button type="button" key={a.id} disabled={off}
                  className={'asopt rmi' + (sel.includes(a.id) ? ' on' : '')}
                  onClick={() => onToggle(a.id)}>
                  <span className="rmtxt">
                    <b>{a.bank} · <span className="mono">{a.account_no}</span></b>
                    <span className="rmline">{a.holder} · {a.currency}
                      {off ? ' — not settled here yet' : ''}</span>
                  </span>
                  <span className="rmk">✓</span>
                </button>
              )
            })}
            {!rows.length && (
              <div className="rmg">No fiat accounts yet — add the one you want to be paid into.</div>
            )}
            <button type="button" className="asopt rmi rmadd"
              onClick={() => { setAdding(true); setOpen(false) }}>
              <b>+ Add an account</b>
            </button>
          </div>
        )}
      </div>
      {/* Adding has to work from here. These terms come straight after
          identity, so the account list is empty for everyone reaching this
          step for the first time — sending them to the Account page to come
          back would drop them out of the application halfway through. */}
      {adding && (
        <BankAccountsModal identity={identity}
          onClose={() => { setAdding(false); reload() }} />
      )}
    </>
  )
}

export function ListingStep({
  d, step, bad, kindLine, identity, onChange,
}: {
  d: Listing
  step: number
  /** Whose accounts the rails picker lists. */
  identity: string
  /** 出错那一行的 id。参照靠给 .sf 加 .bad 让预置的 .err 显出来。 */
  bad: string
  /** 复核页第一行的「主体」，来自身份那一段填的东西。 */
  kindLine: string
  onChange: (d: Listing) => void
}) {
  const set = (p: Partial<Listing>) => onChange({ ...d, ...p })
  const flip = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  const cls = (id: string) => 'sf' + (bad === id ? ' bad' : '')

  /* Assets come from the catalogue, not from a list written into this file.
  
     The hardcoded one offered BTC and ETH, which this version cannot settle:
     picking either got you through the form, through submit, through a
     several-second review, and only then a rejection. Anything the platform
     cannot honour should not be offerable — the server-side check stays as a
     backstop against a hand-rolled request, not as the way users find out. */
  const { data: cat } = useApi(() => ep.assets(), [])
  const coinCodes = (cat ?? []).map(a => a.code)

  /* Which fiat these terms are actually in — read off the rails they picked,
     not written into the page.
  
     It said "CNY" no matter what: someone settling in Hong Kong dollars was
     shown a CNY limit box and a CNY index, and nothing on the page admitted
     it was the wrong currency. Two rails from different corridors is a real
     combination, so say so rather than silently picking one. */
  const { data: accts } = useApi(() => ep.bankAccounts(identity), [identity])
  const pickedAccts = (accts ?? []).filter(a => d.rails.includes(a.id))
  const fiats = [...new Set(pickedAccts.map(a => a.currency))]
  /* Ids that resolve to nothing are counted, not printed: the reader cannot
     act on a raw id, and dropping them silently would make the summary
     disagree with what is about to be submitted. */
  const railGone = d.rails.length - pickedAccts.length
  const railNames = [
    ...pickedAccts.map(a => `${a.bank} · ${a.account_no}`),
    ...(railGone ? [`${railGone} no longer on file`] : []),
  ]
  const fiat = fiats.length === 1 ? fiats[0] : ''
  const idxFiat = fiat || 'CNY'

  const { data: chains } = useApi(() => ep.chainInfo(), [])
  const rows = chains?.chains ?? []
  const netCodes = rows.map(c => c.code)
  /* 哪几条链上真的能锁币，得说出来：没有托管合约的链上挂不了卖单，
     等到签名时被拒才知道就太晚了。 */
  const live = rows.filter(c => c.deployed).map(c => c.name)
  const netHint = !rows.length ? ''
    : live.length ? `Coins can only be locked on: ${live.join(' · ')}`
      : 'No escrow contract is deployed yet — listings here will not lock coins on chain'

  if (step === 1) {
    const px = d.pricing === 'Float'
      ? `Index ${num(d.spread) >= 0 ? '+' : ''}${d.spread}%`
      : `Fixed · ${d.fixed}`
    return (
      <>
        <dl className="sfsum">
          <div><dt>Entity</dt><dd>{kindLine}</dd></div>
          <div><dt>Side</dt><dd>{d.dir.join(' · ')}</dd></div>
          <div><dt>Assets</dt><dd>{d.coins.join(' · ')}</dd></div>
          <div><dt>Limits</dt><dd className="num">
            {num(d.lo).toLocaleString()} – {num(d.hi).toLocaleString()}{fiat ? ` ${fiat}` : ''}</dd></div>
          <div><dt>Networks</dt><dd>{d.nets.join(' · ')}</dd></div>
          <div><dt>Pricing</dt><dd>{px}</dd></div>
          {/* Named, never printed raw. These are account ids now, and a UUID on
              a confirmation page tells the reader nothing about what they are
              about to agree to. */}
          <div><dt>Rails</dt><dd>{railNames.length ? railNames.join(' · ') : '—'}</dd></div>
        </dl>
        <div className={cls('sf-agree')} style={{ marginTop: 14 }}>
          <label className="sfagree">
            <input type="checkbox" checked={d.agree}
              onChange={e => set({ agree: e.target.checked })} />
            <span>I confirm the information is accurate and accept the listing terms.</span>
          </label>
          <span className="err">Accept the terms to submit</span>
        </div>
      </>
    )
  }

  const idx = FX_IDX[idxFiat] ?? FX_IDX.CNY ?? 7.28
  return (
    <>
      <div className={cls('sf-dir')}><span className="sfl">Side</span>
        <Chips opts={['Sell crypto', 'Buy crypto']} sel={d.dir}
          onPick={v => set({ dir: flip(d.dir, v) })} />
        <span className="err">Select a side</span></div>

      <div className={cls('sf-coins')}><span className="sfl">Assets</span>
        <Chips opts={coinCodes} sel={d.coins}
          onPick={v => set({ coins: flip(d.coins, v) })} />
        <span className="err">Select at least one asset</span></div>

      <div className={cls('sf-limit')}><span className="sfl">
        {/* No rail chosen yet, or rails from two corridors: say "fiat" rather
            than name a currency these terms are not necessarily in. */}
        Per-trade limits{fiat ? ` (${fiat})` : ''}</span>
        <div className="sfrow">
          <input type="text" value={d.lo} placeholder="Min" inputMode="numeric"
            onChange={e => set({ lo: e.target.value })} />
          <span>—</span>
          <input type="text" value={d.hi} placeholder="Max" inputMode="numeric"
            onChange={e => set({ hi: e.target.value })} />
        </div>
        <span className="err">Min must be below max</span></div>

      <div className={cls('sf-nets')}><span className="sfl">Networks</span>
        {/* 链的名单来自后端，不写死：这里写死一份、挂单表单写死另一份，
            两处迟早不一样；而且写死的名字（TRON / POLYGON）跟实际发交易的
            那条链根本对不上——挂单说 ETH，币锁在别的链上。 */}
        <Chips opts={netCodes} sel={d.nets}
          onPick={v => set({ nets: flip(d.nets, v) })} />
        <span className="ad" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
          {netHint}
        </span>
        <span className="err">Select at least one network</span></div>

      <div className={cls('sf-pricing')}><span className="sfl">Pricing</span>
        <Chips opts={['Float vs index', 'Fixed rate']}
          sel={[d.pricing === 'Float' ? 'Float vs index' : 'Fixed rate']}
          onPick={v => set({ pricing: v === 'Float vs index' ? 'Float' : 'Fixed' })} />
        {d.pricing === 'Float' ? (
          <div className="sfrow" style={{ marginTop: 8 }}>
            <input type="text" value={d.spread} inputMode="decimal" placeholder="0.8"
              style={{ maxWidth: 110 }} onChange={e => set({ spread: e.target.value })} />
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              % over index — e.g. USDT/{idxFiat} index {idx} → you quote{' '}
              {(idx * (1 + (parseFloat(d.spread) || 0) / 100)).toFixed(2)}
            </span>
          </div>
        ) : (
          <div className="sfrow" style={{ marginTop: 8 }}>
            <input type="text" value={d.fixed} inputMode="decimal" placeholder={String(idx)}
              style={{ maxWidth: 110 }} onChange={e => set({ fixed: e.target.value })} />
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              {idxFiat} per USDT — index is {idx} right now
            </span>
          </div>
        )}
        <span className="err">{d.pricing === 'Float'
          ? 'Enter a spread between −5 and 5' : 'Enter your rate — a positive number'}</span></div>

      <div className={cls('sf-rails') + ' sfrel'}>
        <span className="sfl">Payment rails — which of your accounts counterparties pay</span>
        <AccountMenu identity={identity} sel={d.rails}
          onToggle={v => set({ rails: flip(d.rails, v) })} />
        <span className="err">Select at least one account to be paid into</span></div>
    </>
  )
}

/** 回执里那张「交易条款」表，六行，取自参照的 receiptCard。 */
export function listingRows(
  d: Listing,
  /* The reader's own fiat accounts, so the rail ids in `d` can be named.
     Optional because the receipt can be rendered before they have loaded;
     without them the limits print without a currency and the rails print as
     a count, which is honest. Naming an account we have not resolved, or a
     currency we have not established, would not be. */
  accounts?: BankAccount[],
): [string, string][] {
  /* 每一项都要兜底。这份 d 是后端 form_json 原样发回来的，而后端不校验它的
     形状——用旧版表单交过、或者直接走 API 提交的账号，这里少哪个字段都可能。
     少一个 `?? []` 的后果不是缺一行，是 undefined.join 把整个准入对话炸成白屏，
     而那条对话恰恰是他查「我的申请审到哪了」的唯一入口。 */
  const list = (v: string[] | undefined) => (v?.length ? v.join(' · ') : '—')
  const picked = (accounts ?? []).filter(a => (d.rails ?? []).includes(a.id))
  const ccy = (() => {
    const f = [...new Set(picked.map(a => a.currency))]
    return f.length === 1 ? ` ${f[0]}` : ''
  })()
  /* Rails print as the accounts they are. An id that resolves to nothing is
     counted, not printed: a raw id tells the reader nothing, and dropping it
     silently would make the receipt disagree with what was submitted. */
  const gone = (d.rails ?? []).length - picked.length
  const rails = [
    ...picked.map(a => `${a.bank} · ${a.account_no}`),
    ...(gone ? [`${gone} no longer on file`] : []),
  ]
  return [
    ['Side', list(d.dir)],
    ['Assets', list(d.coins)],
    ['Limits', `${num(d.lo).toLocaleString()} – ${num(d.hi).toLocaleString()}${ccy}`],
    ['Networks', list(d.nets)],
    ['Pricing', d.pricing === 'Float'
      ? `Index ${num(d.spread) >= 0 ? '+' : ''}${d.spread}%` : `Fixed · ${d.fixed || '—'}`],
    ['Payment rails', list(rails)],
  ]
}
