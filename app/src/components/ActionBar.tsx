import { useRef, useState } from 'react'
import PickMenu, { type PickItem } from './PickMenu'
import { avHue, avInit } from './Avatar'
import { ACT_DEF, ATOMS, DATA_METRICS, MAX_CONDS } from './actlang'
import type { Contact, Offer } from '../api/types'

export type ActKind = 'buy' | 'sell'

export interface Act {
  k: ActKind
  amt: number
  coin: string
  fiat: string
  peer: string          // 空 = Any，交给撮合
  conds: { t: string; p: Record<string, string> }[]
  /** 自动开出来的（打字触发）才吃 parseSrc 的虚线规则；手动开的一律实心。 */
  auto?: boolean
  /** 哪些槽是用户说到的。没说到的画虚线——「系统猜的」和「你说的」必须分得出。 */
  parseSrc?: Record<string, 1>
  amtKind?: 'coin' | null
}

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const FIAT_NAME: Record<string, string> = {
  CNY: 'Chinese Yuan', HKD: 'Hong Kong Dollar', SGD: 'Singapore Dollar', JPY: 'Japanese Yen',
  EUR: 'Euro', USD: 'US Dollar', AED: 'UAE Dirham', GBP: 'British Pound',
}
/* 货币码前两位就是 ISO 国家码，映射到 regional indicator 码点，不引外部图片 */
const flag = (c: string) => {
  const cc = c === 'EUR' ? 'EU' : c.slice(0, 2)
  return String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
const av = (n: string) =>
  `<span class="apav" style="background:hsl(${avHue(n)} 42% 34%);color:#fff">${avInit(n)}</span>`

/**
 * 动作行：把一句话变成可点的参数。
 *
 * 与 console.html 的 #abar 同构——句子分三行（条件 / 动作 / 对手方），
 * 连接词走左列对齐。灰色虚线是系统的合理猜测，实心是你说过的。
 */
export default function ActionBar({
  act, onChange, onClose, contacts, offers,
}: {
  act: Act
  onChange: (a: Act) => void
  onClose: () => void
  contacts: Contact[]
  offers: Offer[]
}) {
  const [menu, setMenu] = useState<{ el: HTMLElement; items: PickItem[]; pick: (v: string) => void } | null>(null)
  const [editAmt, setEditAmt] = useState(false)
  const amtRef = useRef<HTMLInputElement>(null)
  const d = ACT_DEF[act.k]

  /* 亲手动过 = 已确认：虚线转实心，哪怕选的还是原值 */
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

  const coins = [...new Set(offers.map(o => o.asset))]
  const fiats = [...new Set(offers.map(o => o.fiat))]
  /* 只列真能接这一笔的人：方向、币种、法币都得对得上，否则选了也走不通 */
  const want = act.k === 'buy' ? 'sell' : 'buy'
  const fits = offers
    .filter(o => o.side === want && o.asset === act.coin && o.fiat === act.fiat)
    .sort((x, y) => (y.maker?.trust_score ?? 0) - (x.maker?.trust_score ?? 0))

  const amtTxt = act.amt.toLocaleString()

  return (
    <div id="abar">
      {/* 跟陌生人交易，条件不标准化就没法双盲撮合：Buy/Sell 的放行条件由协议定死。
          只读一行——不给编辑入口，但也不能不写，否则用户不知道钱凭什么放。 */}
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
          onClick={e => open(e, coins.map(c => ({ v: c, n: c, d: 'Settles on-chain' })),
            v => set({ coin: v }, 'coin'))}>
          {act.coin}<i>⌄</i>
        </button>
        <span className="aword">{d.mid}</span>
        <button className={'achip' + guess('fiat')}
          onClick={e => open(e, fiats.map(f => ({ v: f, n: `${flag(f)} ${f}`, d: FIAT_NAME[f] ?? f })),
            v => set({ fiat: v }, 'fiat'))}>
          <span className="flg">{flag(act.fiat)}</span>{act.fiat}<i>⌄</i>
        </button>
      </div>

      {/* from 不是跟 buy 平级的分句主语，它是连接词——左列留空，落在胶囊列起点 */}
      <div className="aline">
        <span className="aword alead" />
        <span className="aword">{act.k === 'buy' ? 'from' : 'to'}</span>
        <button className={'achip apeer' + guess('peer')}
          onClick={e => open(e, [
            { v: '', n: (act.peer ? '' : '✓ ') + 'Any',
              d: 'Quick trade — Atara matches the best counterparty for this amount' },
            ...fits.map(o => ({
              v: o.maker?.name ?? '',
              n: (act.peer === o.maker?.name ? '✓ ' : '') + av(o.maker?.name ?? '?') + (o.maker?.name ?? ''),
              d: `${contacts.some(c => c.name === o.maker?.name) ? 'In your contacts · ' : ''}`
                + `score ${o.maker?.trust_score} · ${o.maker?.deals} trades`
                + ` · ${FIAT_SYM[o.fiat] ?? ''}${o.unit_price} per ${o.asset}`,
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
