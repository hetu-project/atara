import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { FIAT_RAILS, FX_IDX } from './kycforms'
import type { Listing } from './MakerListing'
import type { Offer } from '../api/types'

/**
 * 一条挂单：一笔量、一个价。
 *
 * 跟身份核验、交易条款同一种载体——一张挂在 Atara AI 对话里的卡片。好处不只
 * 是一致：挂完之后这张卡留在对话里，就是这笔挂单的记录。
 *
 * 可选项不是写死的，是交易条款圈出来的那一份再和目录取交集。参照那边
 * 也做交集（`d.nets.filter(n => NETS_OF[coin].includes(n))`），只是它那份
 * 目录是静态数组，我们这份来自后端——后端只结算 USDT / USDC，条款里勾了
 * BTC 也挂不出来，这里就不该把它摆出来让人点完再被接口打回。
 */

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const railCcy = (name: string) => FIAT_RAILS.find(x => x.list.includes(name))?.ccy
const num = (v: string) => Number(String(v).replace(/[,，\s]/g, ''))

export default function MakerOffer({
  terms, identity, onPosted,
}: {
  terms: Listing | undefined
  identity: string
  onPosted: (o: Offer, sym: string) => void
}) {
  const { data: cat } = useApi(() => ep.assets(), [])
  const { data: fiatCorridors } = useApi(() => ep.fiats(), [])
  const { data: w } = useApi(() => ep.wallet(identity), [identity])

  const [side, setSide] = useState('')
  const [coin, setCoin] = useState('')
  const [net, setNet] = useState('')
  const [fiat, setFiat] = useState('')
  const [px, setPx] = useState('')
  const [qty, setQty] = useState('')
  const [min, setMin] = useState('')
  /* 出错的行，外加它这一次为什么错。一行可能有两种错法（没填 / 填过头），
     只挂一句固定文案的话，空着不填会被告知「不能超过挂单总额」——
     那句话在说另一件事，人会盯着那个数字反复改。参照就是这么写的，
     照抄过来的第一天就有人被它挡住。 */
  const [bad, setBad] = useState<{ id: string; msg?: string }>({ id: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  /* 条款圈的范围 ∩ 目录发的范围。条款没填过就退回目录全集——
     这条路走不到，但空数组会把整张卡渲染成一片空白，那比多写一行糟。 */
  const codes = (cat ?? []).map(a => a.code)
  const sides = terms?.dir.length ? terms.dir : ['Sell crypto', 'Buy crypto']
  const coins = (terms?.coins ?? codes).filter(c => codes.includes(c))
  const curSide = sides.includes(side) ? side : (sides[0] ?? 'Sell crypto')
  const curCoin = coins.includes(coin) ? coin : (coins[0] ?? '')
  const catNets = cat?.find(a => a.code === curCoin)?.networks ?? []
  const nets = (terms?.nets ?? catNets).filter(n => catNets.includes(n))
  const curNet = nets.includes(net) ? net : (nets[0] ?? '')
  /* 能结算哪些法币，由配置里选过的收款渠道决定——你没有那个国家的收款
     账户，就不该对外说你收那种钱。 */
  const tradableFiat = (fiatCorridors ?? []).flatMap(c => c.assets.map(a => a.code))
  const fromRails = [...new Set((terms?.rails ?? []).map(railCcy).filter(Boolean) as string[])]
  const fiats = (fromRails.length ? fromRails : tradableFiat).filter(f => tradableFiat.includes(f))
  const curFiat = fiats.includes(fiat) ? fiat : (fiats[0] ?? '')

  const sell = curSide === 'Sell crypto'
  const sym = FIAT_SYM[curFiat] ?? ''
  const avail = num(w?.assets.find(a => a.asset === curCoin)?.on_chain ?? '0')

  /* 参考价。这一版只结算美元稳定币，所以「币的美元价」恒为 1，
     指数就是法币指数本身——真接上行情源时这里换成报价。 */
  const idx = FX_IDX[curFiat] ?? 1
  const spread = terms?.pricing === 'Float' ? (parseFloat(String(terms.spread)) || 0) : 0
  const quote = +(idx * (1 + spread / 100)).toFixed(2)

  /* 预填要真的写进 state。渲染时写 value={px || quote} 看着一样，但那样
     框子就清不掉了：删空 → px 变成 ''  → 立刻又渲染回建议价，下一个键
     反而接在 7.34 后面变成 7.345。
     换了币或法币，计价基准变了，旧价作废按新指数重填——参照也是这么做的。
     最小成交额只填一次：条款里那行「Per-trade limits (CNY)」问的就是这个数，
     让人再抄一遍没道理，而空着的后果就是提交时被一句报错挡住。 */
  const basis = `${curCoin}|${curFiat}`
  const seeded = useRef('')
  useEffect(() => {
    if (!curCoin || !curFiat || seeded.current === basis) return
    const first = !seeded.current
    seeded.current = basis
    setPx(String(quote))
    if (first && terms?.lo) setMin(String(num(terms.lo)))
  }, [basis, quote, curCoin, curFiat, terms])

  if (cat && (!coins.length || !fiats.length)) {
    return (
      <div className="deal mine xopen">
        <div className="row1"><span className="st">Listing</span><span>Nothing listable</span></div>
        <div className="open"><div className="openin"><div className="pad">
          <p className="sellm-lead">
            {!coins.length
              ? `Your terms cover ${terms?.coins.join(' · ') || 'no assets'}, and this version settles ${codes.join(' and ')}.`
              : `Your payment rails settle in ${fromRails.join(' · ') || 'no currency'}, and this version settles ${tradableFiat.join(', ')}.`}
            {' '}Add one of those to your trading terms and you can post.
          </p>
        </div></div></div>
      </div>
    )
  }

  const post = async () => {
    const p = num(px), q = num(qty), m = num(min)
    setErr('')
    if (!(p > 0)) { setBad({ id: 'of-px' }); return }
    if (!(q > 0)) { setBad({ id: 'of-qty', msg: 'Enter a quantity' }); return }
    if (sell && q > avail) {
      setBad({ id: 'of-qty', msg: `More than you hold — ${avail.toLocaleString()} ${curCoin}` })
      return
    }
    if (!(m > 0)) {
      setBad({ id: 'of-min', msg: 'Enter the smallest trade you will accept' })
      return
    }
    if (m > q * p) {
      setBad({
        id: 'of-min',
        msg: `Must be below the listing total — ${sym}${(q * p).toLocaleString()}`,
      })
      return
    }
    setBad({ id: '' }); setBusy(true)
    try {
      const o = await ep.createOffer({
        side: sell ? 'sell' : 'buy', asset: curCoin, fiat: curFiat,
        unit_price: String(p), qty: String(q), min_lot: String(m),
        network: curNet, networks: [curNet],
      }, identity)
      onPosted(o, sym)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not post')
    } finally { setBusy(false) }
  }

  const chips = (list: string[], sel: string, pick: (v: string) => void) => (
    <div className="sfchips">
      {list.map(x => (
        <button key={x} type="button" className={'sfchip' + (sel === x ? ' on' : '')}
          onClick={() => { setBad({ id: '' }); pick(x) }}>{x}</button>
      ))}
    </div>
  )
  const cls = (id: string) => 'sf' + (bad.id === id ? ' bad' : '')
  /** 这一行现在该说什么：出错了就说这一次错在哪，没出错就是它的常驻提示。 */
  const errMsg = (id: string, dflt: string) => (bad.id === id && bad.msg) || dflt

  return (
    <div className="deal mine xopen">
      <div className="row1"><span className="st">Listing</span><span>New offer</span></div>
      <div className="open"><div className="openin"><div className="pad">
        <p className="sellm-lead">
          One offer with an amount and a price — posting it locks these coins into the
          escrow contract.
        </p>

        <div className="sf"><span className="sfl">Side</span>
          {chips(sides, curSide, setSide)}</div>

        <div className="sf"><span className="sfl">Asset</span>
          {/* 换了计价基准旧价就作废，清掉让它按新指数重新预填 */}
          {chips(coins, curCoin, setCoin)}
          {sell && (
            <span className="ad num" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
              {avail.toLocaleString()} {curCoin} available — locks into escrow while listed
            </span>
          )}
        </div>

        <div className="sf"><span className="sfl">Network</span>
          {chips(nets, curNet, setNet)}</div>

        <div className="sf"><span className="sfl">Settles in</span>
          {chips(fiats, curFiat, setFiat)}</div>

        <div className={cls('of-px')}>
          <span className="sfl">Your rate · {sym} per {curCoin}</span>
          <input type="text" inputMode="decimal" value={px}
            placeholder={String(quote)} onChange={e => { setBad({ id: '' }); setPx(e.target.value) }} />
          <span className="num" style={{ display: 'block', marginTop: 5, fontSize: 11.5, color: 'var(--faint)' }}>
            Index {idx.toLocaleString()}
            {terms?.pricing === 'Float'
              ? ` · your float ${spread >= 0 ? '+' : ''}${spread}% → ${quote.toLocaleString()}`
              : ` · your fixed rate ${(num(terms?.fixed ?? '') || 0).toLocaleString()}`}
          </span>
          <span className="err">Enter a rate</span>
        </div>

        <div className={cls('of-qty')}><span className="sfl">Size · {curCoin}</span>
          <input type="text" inputMode="decimal" value={qty} placeholder="Quantity"
            onChange={e => { setBad({ id: '' }); setQty(e.target.value) }} />
          <span className="err">{errMsg('of-qty', 'Enter a quantity')}</span></div>

        <div className={cls('of-min')}>
          <span className="sfl">Minimum per trade · {curFiat}</span>
          <input type="text" inputMode="numeric" value={min} placeholder="Min lot"
            onChange={e => { setBad({ id: '' }); setMin(e.target.value) }} />
          <span className="err">{errMsg('of-min', 'Must be below the listing total')}</span></div>

        {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

        <div className="dfoot" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" disabled={busy}
            onClick={() => void post()}>Review &amp; post</button>
        </div>
      </div></div></div>
    </div>
  )
}

/** 挂完那张卡：留在对话里就是这笔挂单的记录。 */
export function OfferPosted({ o, sym, onGo }: { o: Offer; sym: string; onGo: () => void }) {
  const sell = o.side === 'sell'
  return (
    <div className="deal done xopen">
      <div className="row1"><span className="st">Listing</span><span>Posted</span></div>
      <div className="open"><div className="openin"><div className="pad">
        <dl className="sfsum">
          <div><dt>Side</dt><dd>{sell ? 'Sell crypto' : 'Buy crypto'}</dd></div>
          <div><dt>Size</dt><dd className="num">{num(o.qty).toLocaleString()} {o.asset}</dd></div>
          <div><dt>Rate</dt><dd className="num">
            {sym}{num(o.unit_price).toLocaleString()} per {o.asset}</dd></div>
          <div><dt>Min lot</dt><dd className="num">{sym}{num(o.min_lot).toLocaleString()}</dd></div>
          {sell && <div><dt>Locked via</dt><dd>Escrow contract · {o.network}</dd></div>}
        </dl>
        <div className="dfoot" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={onGo}>View in Discover →</button>
        </div>
      </div></div></div>
    </div>
  )
}
