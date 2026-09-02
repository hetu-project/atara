import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useAction, useApi } from '../hooks/useApi'
import { ErrorBox } from '../components/bits'
import type { Offer, Order } from '../api/types'

/**
 * 池子。
 *
 * side 参数传的是**我的意图**，后端自己去找反方向的挂单（见 endpoints.offers 的注释）。
 * 卡片上显示的 offer.side 才是挂单自身的方向，两者不是一回事。
 */
export default function Market({ onOrder }: { onOrder: (o: Order) => void }) {
  const [intent, setIntent] = useState<'buy' | 'sell'>('buy')
  // 直接把意图传给后端——它自己会去找反方向的挂单，前端不要再翻。
  const { data: offers, error, loading } = useApi(
    () => ep.offers(intent), [intent])

  return (
    <>
      <h1>Trade</h1>
      <p className="lede">
        挂单是做市方对协议作出的可执行承诺。卖单挂出即上链锁币——你看到的可成交量
        真的在托管合约里，不是一个数字。
      </p>

      <div className="row" style={{ marginBottom: 24 }}>
        <div className="nav" style={{ margin: 0 }}>
          <button aria-current={intent === 'buy' ? 'page' : undefined}
            onClick={() => setIntent('buy')}>我要买币</button>
          <button aria-current={intent === 'sell' ? 'page' : undefined}
            onClick={() => setIntent('sell')}>我要卖币</button>
        </div>
        <span className="muted">
          {intent === 'buy' ? '能卖给你的做市方' : '能从你手上买的做市方'}
          {offers && ` · ${offers.length} 家`}
        </span>
      </div>

      <ErrorBox error={error} />
      {loading && <p className="muted">读取池子…</p>}

      <div className="offers">
        {offers?.map(o => <OfferCard key={o.id} offer={o} onOrder={onOrder} />)}
      </div>
      {offers?.length === 0 && !loading && (
        <p className="muted">这个方向暂时没有活跃挂单。</p>
      )}
    </>
  )
}

const DOC_LABELS: [string, string][] = [
  ['kyc', 'KYC'], ['pof', 'PoF'], ['stm', 'Stmts'],
  ['poa', 'PoA'], ['sow', 'SoW'], ['chain', 'Chain'],
]

function OfferCard({ offer, onOrder }: { offer: Offer; onOrder: (o: Order) => void }) {
  const [amount, setAmount] = useState('')
  // amount_kind 决定 amount 是币还是法币。起投额是法币口径，余量是币口径——
  // 这两个单位不同，界面上必须让人知道自己填的是哪个。
  const [kind, setKind] = useState<'coin' | 'fiat'>('fiat')
  const { run, pending, error } = useAction()

  const take = async () => {
    const o = await run(() => ep.take(offer.id, {
      amount, amount_kind: kind, network: offer.network,
    }))
    if (o) onOrder(o)
  }

  return (
    <div className="offer">
      <div className="top">
        <span className="mk">{offer.maker.name}</span>
        <span className="price num">{offer.unit_price}</span>
      </div>
      <dl>
        <dt>方向</dt><dd>{offer.side === 'sell' ? '卖出' : '买入'} {offer.asset}</dd>
        <dt>可成交</dt><dd className="num">{offer.remaining_qty} {offer.asset}</dd>
        <dt>起投额</dt><dd className="num">{offer.min_lot} {offer.fiat}</dd>
        <dt>上限</dt><dd className="num">{offer.fiat_ceiling} {offer.fiat}</dd>
        <dt>网络</dt><dd>{offer.networks.join(' · ')}</dd>
        <dt>信誉</dt><dd className="num">{offer.maker.trust_score} · {offer.maker.deals} 笔 · {offer.maker.fill_rate}%</dd>
      </dl>
      <div className="docs">
        {DOC_LABELS.map(([k, label]) => (
          <span key={k} className={offer.maker.docs?.[k] ? 'on' : ''}>{label}</span>
        ))}
      </div>

      <div className="row" style={{ marginTop: 4 }}>
        <input type="text" inputMode="decimal" placeholder={kind === 'fiat' ? offer.min_lot : '数量'}
          value={amount} onChange={e => setAmount(e.target.value)}
          style={{ flex: 1, minWidth: 90 }} aria-label="金额" />
        <select value={kind} onChange={e => setKind(e.target.value as 'coin' | 'fiat')}
          aria-label="金额口径">
          <option value="fiat">{offer.fiat}</option>
          <option value="coin">{offer.asset}</option>
        </select>
        <button className="btn sm" onClick={take} disabled={pending || !amount}>
          {pending ? '…' : '吃单'}
        </button>
      </div>
      <ErrorBox error={error} onRemedy={setAmount} />
    </div>
  )
}
