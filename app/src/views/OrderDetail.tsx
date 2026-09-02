import { useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useAction, useApi } from '../hooks/useApi'
import { Countdown, ErrorBox, PhaseChip, Rail } from '../components/bits'
import type { Order } from '../api/types'

/**
 * 一张工单的全过程。
 *
 * 轮询 1 秒：s1 的绑定、s4 的放款都是后端调度器推的，不轮询看不到状态变化。
 * 演示口径下各站只有几秒，所以轮询必须比它快。
 */
export default function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: order, error, reload } = useApi(() => ep.order(id), [id], 1000)
  const { run, pending, error: actErr } = useAction()

  if (error) return <><BackLink onBack={onBack} /><ErrorBox error={error} /></>
  if (!order) return <><BackLink onBack={onBack} /><p className="muted">读取工单…</p></>

  const act = async (fn: () => Promise<unknown>) => { await run(fn); reload() }

  return (
    <>
      <BackLink onBack={onBack} />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {order.otc?.side === 'buy' ? '买入' : '卖出'} {order.amount.amount} {order.amount.asset}
          </h1>
          <p className="mono muted" style={{ margin: 0 }}>{order.ref}</p>
        </div>
        <div className="row">
          <PhaseChip order={order} />
          <Countdown order={order} />
        </div>
      </div>

      <Rail stops={order.rail} />

      <div className="grid two" style={{ marginTop: 24 }}>
        <div className="panel">
          <h2>该做什么</h2>
          <NextAction order={order} act={act} pending={pending} />
          <ErrorBox error={actErr} />
        </div>

        <div className="panel">
          <h2>成交</h2>
          <dl className="kv">
            <dt>对手方</dt><dd>{order.counterparty_name ?? '—'}</dd>
            <dt>单价</dt><dd className="num">{order.otc?.unit_price} {order.otc?.fiat_code}</dd>
            <dt>法币金额</dt><dd className="num">{order.otc?.fiat_amount} {order.otc?.fiat_code}</dd>
            <dt>数字资产</dt><dd className="num">{order.amount.amount} {order.amount.asset}</dd>
            <dt>网络</dt><dd>{order.otc?.network}</dd>
            <dt>状态</dt><dd className="mono">{order.state}</dd>
          </dl>
        </div>
      </div>

      {order.escrow && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>链上事实</h2>
          <p className="lede" style={{ marginBottom: 12 }}>
            这些是链的事实，不是平台的账。合约地址与确认数暴露出来供你自行复核。
          </p>
          <dl className="kv">
            <dt>托管合约</dt><dd className="mono">{order.escrow.contract || '—'}</dd>
            <dt>网络</dt><dd>{order.escrow.network || '—'}</dd>
            <dt>确认数</dt><dd className="num">{order.escrow.confirmations} / {order.escrow.required}</dd>
            <dt>交易</dt><dd className="mono">{order.escrow.tx_hash || '—'}</dd>
            <dt>出资方式</dt><dd>{order.escrow.funding_via || '—'}</dd>
          </dl>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>流水</h2>
        <Events id={id} />
      </div>
    </>
  )
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 16 }}>
      ← 返回
    </button>
  )
}

/**
 * 「该做什么」只依据后端给的 phase / actor，不自己推状态机。
 * phase 为 null 表示没有待办：终态，或者此刻轮不到当前身份。
 */
function NextAction({ order, act, pending }: {
  order: Order
  act: (fn: () => Promise<unknown>) => Promise<void>
  pending: boolean
}) {
  const [ref, setRef] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const fileEl = useRef<HTMLInputElement>(null)

  if (order.terminal) {
    return <p className="muted">
      工单已到终态 <strong>{order.terminal}</strong>，只读。
      {order.terminal === 'disputed' && ' 资金保持锁定，待裁决。'}
    </p>
  }

  // match 站：还没承诺。承诺档由 endpoints.accept 按方向自动选，这里不用管。
  if (order.state === 'match') {
    const sell = order.otc?.side === 'sell'
    return (
      <>
        <p className="lede" style={{ marginBottom: 12 }}>
          {sell
            ? '你要出币。确认即发起入金，需要 Passkey 签名——签的是那笔真实的链上转账。'
            : '对方的币在挂单那一刻就锁进合约了，你不用出资。确认只是一句承诺。'}
        </p>
        <div className="row">
          <button className="btn" disabled={pending}
            onClick={() => act(() => ep.accept(order, sell ? 'wallet' : undefined))}>
            {pending ? '…' : sell ? '签名并入金' : '确认接单'}
          </button>
          {sell && (
            <button className="btn ghost" disabled={pending}
              onClick={() => act(() => ep.accept(order, 'external'))}>
              用外部钱包打款
            </button>
          )}
          <button className="btn ghost" disabled={pending}
            onClick={() => act(() => ep.cancel(order.id))}>撤单</button>
        </div>
      </>
    )
  }

  if (order.phase === 'pay') {
    return (
      <>
        <p className="lede" style={{ marginBottom: 12 }}>
          把 <strong className="num">{order.otc?.fiat_amount} {order.otc?.fiat_code}</strong>
          {' '}点对点转到对方的银行账户——平台不碰这笔钱。转完上传回执。
        </p>
        <div className="row">
          <input type="file" ref={fileEl} onChange={async e => {
            const f = e.target.files?.[0]
            if (!f) return
            const r = await ep.upload(f)
            setRef(r)
          }} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input type="text" placeholder="file_ref（或选文件自动填）" value={ref}
            onChange={e => setRef(e.target.value)} style={{ flex: 1 }} aria-label="回执引用" />
          <button className="btn" disabled={pending || !ref}
            onClick={() => act(() => ep.receipt(order.id, ref))}>
            {pending ? '…' : '提交回执'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          放行只认核过的回执，不等对方开口——所以这张回执要由
          <strong>对方</strong>来核，你自己核不了。
        </p>
      </>
    )
  }

  if (order.phase === 'verify') {
    return (
      <>
        <p className="lede" style={{ marginBottom: 12 }}>
          对方的回执到了：<span className="mono">{order.otc?.receipt_ref ?? '—'}</span>。
          对一遍订单金额与收款账户。<strong>核过就放行</strong>，对不上转异议、资金保持锁定。
        </p>
        {!rejecting ? (
          <div className="row">
            <button className="btn" disabled={pending}
              onClick={() => act(() => ep.verifyReceipt(order.id, true))}>
              {pending ? '…' : '核验通过，放行'}
            </button>
            <button className="btn ghost" onClick={() => setRejecting(true)}>对不上</button>
          </div>
        ) : (
          <>
            <input type="text" placeholder="说明哪里对不上" value={reason}
              onChange={e => setReason(e.target.value)} style={{ width: '100%' }} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn danger" disabled={pending || !reason}
                onClick={() => act(() => ep.verifyReceipt(order.id, false, reason))}>
                转异议
              </button>
              <button className="btn ghost" onClick={() => setRejecting(false)}>返回</button>
            </div>
          </>
        )}
      </>
    )
  }

  if (order.phase === 'wait') {
    return <p className="muted">
      等对方转出 <span className="num">{order.otc?.fiat_amount} {order.otc?.fiat_code}</span>。
      到点是对方逾期，不是你——两件事，两个时长。
    </p>
  }

  if (order.escrow?.needs_funding) {
    return (
      <div className="row">
        <button className="btn" disabled={pending}
          onClick={() => act(() => ep.fund(order, 'wallet'))}>签名入金</button>
        <button className="btn ghost" disabled={pending}
          onClick={() => act(() => ep.fund(order, 'external'))}>外部钱包打款</button>
      </div>
    )
  }

  return <p className="muted">
    {order.phase === 'lock' && '资产进入托管中，无人需要动手。'}
    {order.phase === 'rel' && '回执已核过，正在放款。'}
    {!order.phase && '此刻轮不到你——切换身份可以看到对手方视角。'}
  </p>
}

function Events({ id }: { id: string }) {
  const { data } = useApi(() => ep.order(id), [id], 2000)
  const events = data?.events ?? []
  if (!events.length) return <p className="muted">还没有流水。</p>
  return (
    <ul className="events">
      {[...events].reverse().map(e => (
        <li key={e.seq}>
          <span className="st">{e.from_state || '—'} → {e.to_state}</span>
          <span>{e.reason}</span>
        </li>
      ))}
    </ul>
  )
}
