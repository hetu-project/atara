import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { FIAT_RAILS, FX_IDX } from './kycforms'

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

export const DEMO_LISTING: Partial<Listing> = {
  dir: ['Sell crypto', 'Buy crypto'], coins: ['USDT', 'BTC'], lo: '1000', hi: '50000',
  nets: ['BSC', 'BSC-TESTNET'], rails: ['ICBC', 'China Merchants Bank', 'HSBC', 'DBS'], agree: true,
}

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
 * 渠道菜单。勾选不关面板——多选就该是这个手感；点外面才收起。
 */
function RailMenu({
  sel, onToggle,
}: { sel: string[]; onToggle: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('mousedown', away)
    return () => removeEventListener('mousedown', away)
  }, [open])

  const label = sel.length
    ? `${sel.length} selected — ${sel.slice(0, 3).join(' · ')}${sel.length > 3 ? ` + ${sel.length - 3} more` : ''}`
    : 'Choose banks and rails…'

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" className="sfdd" aria-expanded={open}
        onClick={() => setOpen(o => !o)}><span>{label}</span><i>⌄</i></button>
      {open && (
        <div className="ddmenu railmenu">
          {FIAT_RAILS.map(gr => (
            <div key={gr.g}>
              <div className="rmg">{gr.g}</div>
              {gr.list.map(x => (
                <button type="button" key={x}
                  className={'asopt rmi' + (sel.includes(x) ? ' on' : '')}
                  onClick={() => onToggle(x)}>
                  <b>{x}</b><span className="rmk">✓</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ListingStep({
  d, step, bad, kindLine, onChange,
}: {
  d: Listing
  step: number
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
            {num(d.lo).toLocaleString()} – {num(d.hi).toLocaleString()} CNY</dd></div>
          <div><dt>Networks</dt><dd>{d.nets.join(' · ')}</dd></div>
          <div><dt>Pricing</dt><dd>{px}</dd></div>
          <div><dt>Rails</dt><dd>{d.rails.join(' · ')}</dd></div>
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

  const idx = FX_IDX.CNY ?? 7.28
  return (
    <>
      <div className={cls('sf-dir')}><span className="sfl">Side</span>
        <Chips opts={['Sell crypto', 'Buy crypto']} sel={d.dir}
          onPick={v => set({ dir: flip(d.dir, v) })} />
        <span className="err">Select a side</span></div>

      <div className={cls('sf-coins')}><span className="sfl">Assets</span>
        <Chips opts={['USDT', 'USDC', 'BTC', 'ETH']} sel={d.coins}
          onPick={v => set({ coins: flip(d.coins, v) })} />
        <span className="err">Select at least one asset</span></div>

      <div className={cls('sf-limit')}><span className="sfl">Per-trade limits (CNY)</span>
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
              % over index — e.g. USDT/CNY index {idx} → you quote{' '}
              {(idx * (1 + (parseFloat(d.spread) || 0) / 100)).toFixed(2)}
            </span>
          </div>
        ) : (
          <div className="sfrow" style={{ marginTop: 8 }}>
            <input type="text" value={d.fixed} inputMode="decimal" placeholder={String(idx)}
              style={{ maxWidth: 110 }} onChange={e => set({ fixed: e.target.value })} />
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              CNY per USDT — index is {idx} right now
            </span>
          </div>
        )}
        <span className="err">{d.pricing === 'Float'
          ? 'Enter a spread between −5 and 5' : 'Enter your rate — a positive number'}</span></div>

      <div className={cls('sf-rails') + ' sfrel'}>
        <span className="sfl">Payment rails — where counterparties send fiat</span>
        <RailMenu sel={d.rails} onToggle={v => set({ rails: flip(d.rails, v) })} />
        <span className="err">Select at least one payment rail</span></div>
    </>
  )
}

/** 回执里那张「交易条款」表，六行，取自参照的 receiptCard。 */
export function listingRows(d: Listing): [string, string][] {
  return [
    ['Side', d.dir.join(' · ')],
    ['Assets', d.coins.join(' · ')],
    ['Limits', `${num(d.lo).toLocaleString()} – ${num(d.hi).toLocaleString()} CNY`],
    ['Networks', d.nets.join(' · ')],
    ['Pricing', d.pricing === 'Float'
      ? `Index ${num(d.spread) >= 0 ? '+' : ''}${d.spread}%` : `Fixed · ${d.fixed}`],
    ['Payment rails', d.rails.join(' · ')],
  ]
}
