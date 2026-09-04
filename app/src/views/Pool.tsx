import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { go } from '../hooks/useRoute'
import type { Offer } from '../api/types'

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const flag = (c: string) => {
  const cc = c === 'EUR' ? 'EU' : c.slice(0, 2)
  return String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
const relText = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`

/** 资质件六项。缺件也公开——让买家自己给缺口定价，而不是平台替他隐藏。 */
const DOCS: [string, string, string][] = [
  ['kyc', 'KYC', 'Identity verified by the platform'],
  ['pof', 'PoF', 'Proof of funds — will share on request'],
  ['stm', 'Stmts', 'Bank statements — will share on request'],
  ['poa', 'PoA', 'Corporate authorization / power of attorney'],
  ['sow', 'SoW', 'Source of wealth — verified for large sizes'],
  ['chain', 'Chain', 'On-chain address provenance screened'],
]

/**
 * Discover · 交易池。
 *
 * 「购买」看的是对方挂的卖单，「出售」看的是对方挂的买单——方向要反过来配。
 * 卡上那几样都不是装饰：信任分是选谁交易的第一判断，履约数据是分数的来源
 * （不能只给分不给依据），最小单决定这条单跟我有没有关系。
 */
export default function Pool({ identity }: { identity: string }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [coin, setCoin] = useState('All')
  const [fiat, setFiat] = useState('')

  const { data, loading } = useApi(() => ep.offers(side), [side])
  const { data: mine } = useApi(() => ep.myOffers(identity), [identity])
  const mineIds = new Set((mine ?? []).map(o => o.id))

  const all = data ?? []
  const coins = ['All', ...new Set(all.map(o => o.asset))]
  const fiats = [...new Set(all.map(o => o.fiat))]
  const list = all
    .filter(o => coin === 'All' || o.asset === coin)
    .filter(o => !fiat || o.fiat === fiat)
    /* 自己的单置顶——挂完得马上看见；其余按 AI 分从高到低 */
    .sort((a, b) => (mineIds.has(b.id) ? 1 : 0) - (mineIds.has(a.id) ? 1 : 0)
      || b.maker.trust_score - a.maker.trust_score)

  return (
    <div className="view on" id="v-market">
      <div className="vhead"><h2>Discover</h2></div>
      <div className="vbody" id="mkbody">
        <div className="mkbar">
          {/* 方向在最前，因为买家和卖家看的是两批完全不同的挂单 */}
          <div className="mkside" role="tablist" aria-label="Side">
            {(['buy', 'sell'] as const).map(s => (
              <button key={s} className={'mks' + (side === s ? ' on' : '')} role="tab"
                aria-selected={side === s} onClick={() => setSide(s)}>
                {s === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          <div className="mkfilter">
            {coins.map(c => (
              <button key={c} className={'mkf' + (coin === c ? ' on' : '')}
                onClick={() => setCoin(c)}>{c}</button>
            ))}
          </div>
          <button className="mkfiat" onClick={() => {
            const i = fiats.indexOf(fiat)
            setFiat(i + 1 >= fiats.length ? '' : (fiats[i + 1] ?? ''))
          }}>
            {fiat ? `${flag(fiat)} ${fiat}` : 'Any currency'}
          </button>
        </div>

        <div id="pool">
          {list.map(o => <OfferCard key={o.id} o={o} side={side} mine={mineIds.has(o.id)} identity={identity} />)}
          {!list.length && (
            <div className="mkempty">{loading ? 'Loading offers…' : 'No offers match'}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function OfferCard({
  o, side, mine, identity,
}: { o: Offer; side: 'buy' | 'sell'; mine: boolean; identity: string }) {
  const m = o.maker
  const sym = FIAT_SYM[o.fiat] ?? ''
  const px = Number(o.unit_price)
  const qty = Number(o.remaining_qty)
  const ceiling = Math.round(Number(o.fiat_ceiling))
  const docsOn = Object.values(m.docs ?? {}).filter(Boolean).length

  const take = async () => {
    if (mine) {
      await ep.delistOffer(o.id, identity).catch(() => {})
      location.reload()
      return
    }
    try {
      /* 按币的数量下单：法币金额是换算出来的，整条挂单那一档会因为四舍五入
         比可成交量多出几分，然后被后端拒掉。 */
      const ord = await ep.take(o.id, {
        amount: o.remaining_qty, amount_kind: 'coin', network: o.networks[0] ?? o.network,
      })
      go({ view: 'order', id: ord.id })
    } catch { /* 错误由工单页或下一次拉取暴露 */ }
  }

  return (
    <button className={'od' + (mine ? ' odmine' : '')} onClick={() => void take()}>
      <div className="od-h">
        <span className="od-peer">{m.name}
          <i className="od-id num">{m.peer_code}</i>
          {mine ? <i className="od-known">Your listing · {o.side === 'sell' ? 'selling' : 'buying'}</i> : null}
        </span>
        {/* 信任分是选谁交易的第一判断依据 */}
        <span className={'od-ai ' + (m.trust_score >= 85 ? 'hi' : m.trust_score < 70 ? 'lo' : '')}
          style={{ ['--p' as string]: m.trust_score }}
          title="AI risk score — priced from settlement history, fund provenance and dispute record">
          <span className="od-ring">
            <svg viewBox="0 0 44 44" aria-hidden>
              <circle className="trk" cx="22" cy="22" r="18" />
              <circle className="val" cx="22" cy="22" r="18" />
            </svg>
            <b className="num">{m.trust_score}</b>
          </span>
          <em>AI score</em>
        </span>
      </div>

      {/* 分数的来源，不能只给分不给依据 */}
      <div className="od-trust">
        {mine ? <span>New merchant — history builds as trades settle</span> : (
          <>
            <span><b className="num">{m.deals}</b>&nbsp; trades</span>
            <em>·</em><span><b className="num">{m.fill_rate}%</b>&nbsp; completion</span>
            <em>·</em><span>Avg release <b className="num">{relText(m.median_release_secs)}</b></span>
          </>
        )}
      </div>

      <div className="od-px">
        <b className="num">{sym}{px.toLocaleString()}</b>
        <span>per {o.asset} · settles in {flag(o.fiat)} {o.fiat}</span>
      </div>

      <dl className="od-kv">
        <div><dt>Size</dt><dd className="num">{qty.toLocaleString()} {o.asset}</dd></div>
        <div><dt>Limits</dt>
          <dd className="num">{Number(o.min_lot).toLocaleString()} – {ceiling.toLocaleString()} {o.fiat}</dd></div>
        <div><dt>Networks</dt>
          <dd>{o.networks.map(n => <span className="od-net" key={n}>{n}</span>)}</dd></div>
        <div>
          <dt>Docs<span className="od-dn num">{docsOn}/6</span></dt>
          <dd className="od-docs">
            {DOCS.map(([k, lb, tip]) => (
              <span key={k} className={'doc' + (m.docs?.[k] ? ' on' : '')}
                title={tip + (m.docs?.[k] ? '' : ' — not provided')}>
                {m.docs?.[k] ? '✓' : '✕'} {lb}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <div className="od-f">
        {m.disputes
          ? <span className="od-disp">{m.disputes} disputes</span>
          : <span className="od-disp ok">No disputes</span>}
        <span className="od-cta">{mine ? 'Unlist' : side === 'buy' ? 'Buy' : 'Sell'}</span>
      </div>
    </button>
  )
}
