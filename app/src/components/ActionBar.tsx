import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import PickMenu, { type PickItem } from './PickMenu'
import { avHue, avInit } from './Avatar'
import { ACT_DEF, ATOMS, DATA_METRICS, MAX_CONDS } from './actlang'
import { useApi } from '../hooks/useApi'
import type { CatalogAsset, Contact, EligiblePeer } from '../api/types'
import { scoreText } from '../api/types'

export type ActKind = 'buy' | 'sell'

export interface Act {
  k: ActKind
  amt: number
  coin: string
  fiat: string
  peer: string          // empty = Any, left to matching
  conds: { t: string; p: Record<string, string> }[]
  /** Only auto-opened ones (triggered by typing) obey parseSrc's dashed-outline rule; manually opened ones are always solid. */
  auto?: boolean
  /** Which slots the user actually named. Unnamed ones get a dashed outline -- "the system guessed" and "you said so" must stay distinguishable. */
  parseSrc?: Record<string, 1>
  amtKind?: 'coin' | null
}

/* The first two letters of a currency code are the ISO country code; map them to regional indicator code points, no external images */
const flag = (c: string) => {
  const cc = c === 'EUR' ? 'EU' : c.slice(0, 2)
  return String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
/**
 * Action bar: turns a sentence into clickable parameters.
 *
 * Isomorphic with console.html's #abar -- the sentence splits into three lines (condition /
 * action / counterparty) with connectives aligned in the left column. Grey dashed means a
 * reasonable guess by the system, solid means you said it.
 */
export default function ActionBar({
  act, onChange, onClose, contacts,
}: {
  act: Act
  onChange: (a: Act) => void
  onClose: () => void
  contacts: Contact[]
}) {
  /* The available currencies and fiat come from the catalog, not inferred from whatever listings
     happen to be in the pool -- that would list "what someone happened to post", not "what the
     system supports", and users would find the options changing under them as they switch currency. */
  const { data: assets } = useApi(() => ep.assets(), [])
  const { data: fiatGroups } = useApi(() => ep.fiats(), [])
  const [menu, setMenu] = useState<{ el: HTMLElement; items: PickItem[]; pick: (v: string) => void } | null>(null)
  const [editAmt, setEditAmt] = useState(false)
  const amtRef = useRef<HTMLInputElement>(null)
  const d = ACT_DEF[act.k]

  /* Touched by hand = confirmed: dashed becomes solid, even if the value picked is unchanged */
  const set = (patch: Partial<Act>, mark?: string) => {
    const next = { ...act, ...patch }
    if (mark) next.parseSrc = { ...(act.parseSrc ?? {}), [mark]: 1 }
    onChange(next)
  }
  const guess = (f: string) => (act.auto && !act.parseSrc?.[f] ? ' guess' : '')
  const open = (e: React.MouseEvent, items: PickItem[], pick: (v: string) => void) => {
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    setMenu(m => (m?.el === el ? null : { el, items, pick }))
  }

  const coins: CatalogAsset[] = assets ?? []
  const fiats: CatalogAsset[] = (fiatGroups ?? []).flatMap(g => g.assets)
  const fiatOf = (c: string) => fiats.find(f => f.code === c)
  const symOf = (c: string) => fiatOf(c)?.symbol ?? ''

  /* Only list people who can actually take this order. The backend computes this layer: direction,
     currency and fiat have to line up, and the amount has to fall between their minimum and their
     available volume -- a frontend filter would miss the last two. */
  const [fits, setFits] = useState<EligiblePeer[]>([])
  useEffect(() => {
    let alive = true
    ep.eligibleCounterparties({
      side: act.k, asset: act.coin, fiat: act.fiat,
      amount: String(act.amt), amount_kind: 'coin',
    }).then(r => { if (alive) setFits(r) }).catch(() => { if (alive) setFits([]) })
    return () => { alive = false }
  }, [act.k, act.coin, act.fiat, act.amt])

  const amtTxt = act.amt.toLocaleString()

  return (
    <div id="abar">
      {/* Trading with strangers is not double-blind-matchable unless the conditions are standardised:
          the release conditions for Buy/Sell are fixed by the protocol. A read-only line -- no edit
          affordance, but it cannot be omitted either, or the user does not know what releases the money. */}
      <div className="aline">
        <span className="aword alead">Release condition</span>
        <span className="afix">Verified bank receipt
          <i className="ainfo" tabIndex={0} data-tip="Fixed for pool trades — release never waits on the other side's word. Their coins lock in escrow when they list; they release once the fiat receipt reconciles with the order.">i</i>
        </span>
      </div>

      <div className="aline">
        <span className="averb alead">{d.verb}</span>
        {editAmt ? (
          <input className="acin" ref={amtRef} defaultValue={String(act.amt)} autoFocus
            style={{ width: 96 }}
            onBlur={e => {
              const v = parseFloat(e.target.value.replace(/[^\d.]/g, ''))
              setEditAmt(false)
              if (v > 0) set({ amt: v }, 'amt')
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        ) : (
          <button className={'achip' + guess('amt')} onClick={e => { e.preventDefault(); setEditAmt(true) }}>
            {amtTxt}<i>✎</i>
          </button>
        )}
        <button className={'achip' + guess('coin')}
          onClick={e => open(e, coins.map(c => ({
            v: c.code, n: (act.coin === c.code ? '✓ ' : '') + c.code,
            d: `${c.name} · settles on ${(c.networks ?? []).join(' / ')}`,
          })), v => set({ coin: v }, 'coin'))}>
          {act.coin}<i>⌄</i>
        </button>
        <span className="aword">{d.mid}</span>
        <button className={'achip' + guess('fiat')}
          onClick={e => open(e, fiats.map(f => ({
            v: f.code, n: (act.fiat === f.code ? '✓ ' : '') + `${flag(f.code)} ${f.code}`, d: f.name,
          })), v => set({ fiat: v }, 'fiat'))}>
          <span className="flg">{flag(act.fiat)}</span>{act.fiat}<i>⌄</i>
        </button>
      </div>

      {/* from is not a clause subject on a par with buy, it is a connective -- left column stays empty and it lands at the start of the pill column */}
      <div className="aline">
        <span className="aword alead" />
        <span className="aword">{act.k === 'buy' ? 'from' : 'to'}</span>
        <button className={'achip apeer' + guess('peer')}
          onClick={e => open(e, [
            { v: '', n: (act.peer ? '' : '✓ ') + 'Any',
              d: 'Quick trade — Atara matches the best counterparty for this amount' },
            ...fits.map(p => ({
              v: p.display_name,
              n: (act.peer === p.display_name ? '✓ ' : '') + p.display_name,
              av: p.display_name,
              d: `${contacts.some(c => c.name === p.display_name) ? 'In your contacts · ' : ''}`
                + `${scoreText(p.trust_score)} · ${p.deals} trades`
                + ` · ${symOf(act.fiat)}${p.best_price} per ${act.coin}`,
            })),
          ], v => set({ peer: v }, 'peer'))}>
          {act.peer
            ? <><span className="apav" style={{ background: `hsl(${avHue(act.peer)} 42% 34%)`, color: '#fff' }}>{avInit(act.peer)}</span>{act.peer}</>
            : 'Any'}
          <i>⌄</i>
        </button>
      </div>

      <button className="ax" aria-label="Cancel"
        onClick={e => { e.preventDefault(); onClose() }}>✕</button>

      {menu && (
        <PickMenu anchor={menu.el} items={menu.items}
          onPick={menu.pick} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

export { ATOMS, DATA_METRICS, MAX_CONDS }
