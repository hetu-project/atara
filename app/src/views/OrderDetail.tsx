import { useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import Avatar from '../components/Avatar'
import { useAction, useApi } from '../hooks/useApi'
import type { Order } from '../api/types'

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const FIAT_NAME: Record<string, string> = {
  CNY: 'Chinese Yuan', HKD: 'Hong Kong Dollar', SGD: 'Singapore Dollar', JPY: 'Japanese Yen',
  EUR: 'Euro', USD: 'US Dollar', AED: 'UAE Dirham', GBP: 'British Pound',
}
const flag = (c: string) => {
  const cc = c === 'EUR' ? 'EU' : c.slice(0, 2)
  return String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
const money = (v: number, c: string) =>
  `${FIAT_SYM[c] ?? ''}${Math.round(v).toLocaleString()} ${c}`

/**
 * 一张工单的全过程，与 console.html 的 .deal 卡同构：
 * 状态行（可折叠）→ 轨道 → 主数字 → KV 组 → 说明句 → 动作行。
 *
 * 轮询 1 秒：s1 的绑定、s4 的放款都是后端调度器推的，不轮询看不到状态变化；
 * 演示口径下各站只有几秒，轮询必须比它快。
 */
export default function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: o, error, reload } = useApi(() => ep.order(id), [id], 1000)
  const { run, pending, error: actErr } = useAction()
  const [open, setOpen] = useState(true)
  const file = useRef<HTMLInputElement>(null)

  if (error) return <Shell onBack={onBack}><div className="mkempty">{error.message}</div></Shell>
  if (!o) return <Shell onBack={onBack}><div className="mkempty">Loading the order…</div></Shell>

  const act = async (fn: () => Promise<unknown>) => { await run(fn); reload() }
  const sell = o.otc?.side === 'sell'
  const coin = `${Number(o.amount.amount).toLocaleString()} ${o.amount.asset}`
  const ccy = o.otc?.fiat_code ?? 'CNY'
  const fiat = money(Number(o.otc?.fiat_amount ?? 0), ccy)
  const step = o.terminal && o.terminal !== 'completed' ? 'dead' : o.state
  /* 终态且非完成：轨道停在原地，没有「当前站」——
     把第一站标成 now 会读成「刚开始」，而它其实已经结束了。 */
  const idx = step === 'dead' ? -1
    : ({ match: 0, s1: 1, s3: 2, s3v: 3, s4: 3, s5: 4 } as Record<string, number>)[step] ?? 0
  const mine = o.actor === 'you' || step === 'match'
  const over = step === 's5' || step === 'dead'

  const badge = ({
    match: 'Pending', s1: sell ? 'Escrowing' : 'Waiting',
    s3: sell ? 'Waiting' : 'Your turn', s3v: 'Verifying', s4: 'Verifying',
    s5: 'Done', dead: 'Timed out',
  } as Record<string, string>)[step] ?? 'In progress'

  /* 状态行那句话按买卖方向分叉——两侧看到的事实本来就不一样 */
  const line = sell ? ({
    match: <>Sell {coin} for <b className="amt">{fiat}</b></>,
    s1: <>Sell {coin} for <b className="amt">{fiat}</b> · your coins locking into escrow</>,
    s3: <>Waiting on their <b className="amt">{fiat}</b> · your {coin} is safe in escrow</>,
    s3v: <>Their receipt is in · <b className="amt">{fiat}</b> reported sent</>,
    s4: <>Verifying their receipt · <b className="amt">{fiat}</b> reported sent</>,
    s5: <><b className="amt">{fiat}</b> received · performance written back to score</>,
    dead: <>Their payment window missed · your {coin} returned from escrow</>,
  } as Record<string, JSX.Element>)[step] : ({
    match: <>Buy {coin} for <b className="amt">{fiat}</b></>,
    s1: <>Buy {coin} for <b className="amt">{fiat}</b> · verifying their escrow</>,
    s3: <>Your turn — pay <b className="amt">{fiat}</b> · their {coin} is in escrow</>,
    s3v: <>Verifying receipt · <b className="amt">{fiat}</b> sent</>,
    s4: <>Verifying receipt · <b className="amt">{fiat}</b> sent</>,
    s5: <><b className="amt">{coin}</b> credited · performance written back to score</>,
    dead: <>Payment window missed · their {coin} was returned</>,
  } as Record<string, JSX.Element>)[step]

  const upload = async () => {
    const f = file.current?.files?.[0]
    if (!f) return
    /* 放款依据是这份银行凭证，所以它必须真的存在——
       编一个 file_ref 交上去，等于让「核验回执」核验一个空气。 */
    await act(async () => {
      const ref = await ep.upload(f)
      return ep.receipt(o.id, ref)
    })
  }

  return (
    <Shell onBack={onBack}>
      <div className={'deal' + (mine ? ' mine' : '') + (over ? ' done' : '') + (open ? ' xopen' : '')}>
        <div className="row1" role="button" tabIndex={0} aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) } }}>
          <span className="st">{badge}</span>
          <span className="dsum">{line}</span>
          {o.seconds_left > 0 && (
            <span className="cd num">
              ⏱ {Math.floor(o.seconds_left / 60)}:{String(o.seconds_left % 60).padStart(2, '0')}
            </span>
          )}
          <span className="dchev" aria-hidden>⌃</span>
        </div>

        <div className="open"><div className="openin">
          <Rail at={idx} sell={sell} />
          <div className="pad">
            {step === 'match' ? (
              <>
                <div className="dhead">
                  <b className="damt num">{sell ? 'Sell' : 'Buy'} {coin}</b>
                  <span className="dsub num">{fiat} · {o.otc?.unit_price} per unit</span>
                </div>
                <Peer o={o} ccy={ccy} />
                <p className="dmech">
                  They fund escrow first. Release follows your bank receipt, not their confirmation.
                </p>
                <div className="dfoot">
                  <a href="#" className="dcancel lnk"
                    onClick={e => { e.preventDefault(); void act(() => ep.cancel(o.id)) }}>Drop</a>
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => void act(() => ep.accept(o))}>Confirm</button>
                </div>
              </>
            ) : step === 's3' && o.phase === 'pay' ? (
              <>
                {/* 卡号与附言是要抄进银行 App 的，给复制按钮而不是让人手抄 */}
                <div className="dhead">
                  <b className="damt num">Transfer {fiat}</b>
                  <span className="dsub">to the account below, then upload the receipt</span>
                </div>
                <dl className="dpay">
                  <div><dt>Escrow</dt><dd>
                    <span className="esok">✓ {coin} locked</span>
                    {/* 确认数只在真有一笔入金时才有意义。买方向是绑定对方挂单
                        时就锁好的仓，没有转账可数——显示 0/6 会让人以为卡住了。 */}
                    <span className="dmono">
                      {o.escrow?.tx_hash ? `tx ${o.escrow.tx_hash.slice(0, 6)}…${o.escrow.tx_hash.slice(-4)}` : 'bound to this order'}
                      {o.escrow?.funding_via && o.escrow.required
                        ? ` · ${o.escrow.confirmations}/${o.escrow.required} confirmations` : ''}
                    </span>
                  </dd></div>
                  <div><dt>Reference</dt><dd>
                    <span className="dmono">{o.ref}</span>
                    <Copy text={o.ref} />
                    <span className="dreq">required</span>
                  </dd></div>
                </dl>
                <p className="dmech">Miss the window and it returns to them, recorded as a default.</p>
                <div className="dfoot">
                  <a href="#" className="lnk ecancel" style={{ marginRight: 'auto' }}
                    onClick={e => { e.preventDefault(); void act(() => ep.cancel(o.id)) }}>Cancel order</a>
                  <input type="file" ref={file} hidden accept="image/*,application/pdf"
                    onChange={() => void upload()} />
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => file.current?.click()}>Upload receipt</button>
                </div>
              </>
            ) : step === 's3v' && o.phase === 'verify' ? (
              <>
                <div className="dhead">
                  <b className="damt num">Verify their receipt</b>
                  <span className="dsub">{fiat} reported sent — check it landed before releasing</span>
                </div>
                <Peer o={o} ccy={ccy} />
                {/* 放款依据是银行凭证，不是任何一方的确认意愿——所以核验的是收款方 */}
                <p className="dmech">
                  Release is yours to confirm because the money lands in your account. Amount, reference
                  and sender name should match the order.
                </p>
                <div className="dfoot">
                  <a href="#" className="lnk dspx" style={{ marginRight: 'auto' }}
                    onClick={e => { e.preventDefault(); void act(() => ep.verifyReceipt(o.id, false, 'Receipt does not match')) }}>
                    It does not match
                  </a>
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => void act(() => ep.verifyReceipt(o.id, true))}>Confirm receipt</button>
                </div>
              </>
            ) : (
              <Waiting o={o} sell={sell} step={step} coin={coin} fiat={fiat} ccy={ccy}
                onCancel={() => void act(() => ep.cancel(o.id))} pending={pending} />
            )}
          </div>
        </div></div>
      </div>

      {actErr ? <div className="mkempty">{actErr.message}</div> : null}
    </Shell>
  )
}

/** 轨道。站名按买卖方向分叉：买方的 s1 是验证锁仓，卖方的 s1 是自己的币上链。 */
function Rail({ at, sell }: { at: number; sell: boolean }) {
  const stops: [string, string][] = sell
    ? [['Matched', ''], ['Escrow funded', '~2 min'], ['Their transfer', '4 h window'], ['Verify & release', '~2 min']]
    : [['Matched', ''], ['Escrow verified', 'seconds'], ['Your transfer', '4 h window'], ['Verify & release', '~2 min']]
  return (
    <div className="erail" style={{ padding: '0 20px 14px' }}>
      {stops.map(([n, eta], k) => (
        <span key={n} className={'es ' + (k < at ? 'done' : k === at ? 'now' : '')}>
          <i />{n}{k === at && eta ? ` · ${eta}` : ''}
        </span>
      ))}
    </div>
  )
}

/** 对手方那几行在每个阶段都长一样，抽出来。 */
function Peer({ o, ccy }: { o: Order; ccy: string }) {
  const name = o.counterparty_name ?? '—'
  return (
    <dl className="dpay">
      <div><dt>Counterparty</dt>
        <dd><span className="cplink still"><Avatar name={name} />{name}</span></dd></div>
      <div><dt>Settles in</dt>
        <dd><span className="flg">{flag(ccy)}</span>{ccy} — {FIAT_NAME[ccy] ?? ccy}</dd></div>
      <div><dt>Amount</dt>
        <dd>{Number(o.amount.amount).toLocaleString()} {o.amount.asset}</dd></div>
    </dl>
  )
}

/**
 * 等待与终态。用户在这几步是闲着的，恰恰是最想回头核对对手方的时候——
 * 所以照样把资料摆出来，只是没有动作按钮。
 */
function Waiting({
  o, sell, step, coin, fiat, ccy, onCancel, pending,
}: {
  o: Order; sell: boolean; step: string; coin: string; fiat: string; ccy: string
  onCancel: () => void; pending: boolean
}) {
  const head: Record<string, [string, string]> = sell ? {
    s1: ['Locking your coins', o.escrow?.funding_via === 'external'
      ? 'From your external wallet — detection is automatic'
      : 'Signed from your wallet · confirming on-chain'],
    s3: [`Waiting on ${o.counterparty_name ?? 'them'}`,
      `They send ${fiat} to your registered account, then upload the receipt`],
    s3v: ['Their receipt is in', 'Check it against your account before releasing'],
    s4: ['Verifying their receipt', 'Amount, reference and sender name are checked against the escrow'],
    s5: [`${fiat} received`, 'Escrow released to them · performance written back to both records'],
    dead: ['Their payment window missed', `Your ${coin} came back from escrow · their miss recorded`],
  } : {
    s1: ['Verifying their escrow', 'Locked when they listed — binding it to this order'],
    s3: [`Waiting on ${o.counterparty_name ?? 'them'}`, 'They are sending the transfer'],
    s3v: ['Waiting on their check', 'They confirm the money landed, then escrow releases'],
    s4: ['Verifying your receipt', 'Amount, reference and sender name are checked against the escrow'],
    s5: [`${coin} credited`, 'Settled in full · performance written back to their score'],
    dead: ['Payment window missed', `Their ${coin} was returned and the miss recorded against your score`],
  }
  const mech: Record<string, string> = {
    s1: sell
      ? 'Your coins sit in the escrow contract — not with Atara, not with them. They release only when the buyer’s payment clears verification.'
      : 'Locked at listing, bound to your order now. If the binding fails, the trade closes — no exposure to you.',
    s3: 'Your coins stay locked while they pay. If the window lapses, escrow returns them automatically.',
    s3v: 'Release is automatic once the receipt is confirmed. Neither side can hold the funds back.',
    s4: 'Release is automatic once the receipt matches. Neither side can hold the funds back.',
    s5: 'The evidence pack is the settlement record — receipt, escrow release and both signatures.',
    dead: 'Funds returned automatically — nothing was held. The miss stays on the record.',
  }
  const h = head[step] ?? ['In progress', '']

  return (
    <>
      <div className="dhead">
        <b className="damt num">{h[0]}</b>
        <span className="dsub">{h[1]}</span>
      </div>
      <Peer o={o} ccy={ccy} />
      {/* 入金观察窗：等的就是「钱真的进合约了」这个证据，给他看链上的过程，
          而不是一根干等的倒计时 */}
      {step === 's1' && o.escrow && (
        <div className="eswin">
          <div className="fal">
            <span>Escrow contract · {o.escrow.network}</span>
            <span className="esaddr">
              <Copy text={o.escrow.contract} label={`${o.escrow.contract.slice(0, 6)}…${o.escrow.contract.slice(-4)}`} mono />
              {o.escrow.explorer && (
                <a className="esxp" href={o.escrow.explorer} target="_blank" rel="noopener"
                  title="View on explorer" onClick={e => e.stopPropagation()}>↗</a>
              )}
            </span>
          </div>
          {o.escrow.funding_via && o.escrow.required ? (
            <div className="fconf">
              <i className={o.escrow.confirmations >= o.escrow.required ? 'ok' : ''} />
              <span>{o.escrow.confirmations >= o.escrow.required
                ? `Escrowed · ${coin} locked in the contract`
                : <>Confirming on-chain · <b className="num">{o.escrow.confirmations}/{o.escrow.required}</b></>}</span>
            </div>
          ) : (
            /* 买方向：币在对方挂单那一刻就进合约了，这里只是查锁仓、绑订单 */
            <div className="fwait"><i />Checking the listing lock…</div>
          )}
        </div>
      )}
      <p className="dmech">{mech[step] ?? ''}</p>
      {step === 's1' && (
        <div className="dfoot">
          <a href="#" className="lnk ecancel" onClick={e => { e.preventDefault(); if (!pending) onCancel() }}>
            Cancel order
          </a>
        </div>
      )}
    </>
  )
}

function Copy({ text, label, mono }: { text: string; label?: string; mono?: boolean }) {
  const [hit, setHit] = useState(false)
  return (
    <button type="button" className={mono ? 'esbtn num' : 'cpbtn'}
      title="Copy" onClick={e => {
        e.preventDefault(); e.stopPropagation()
        navigator.clipboard?.writeText(text)
        setHit(true); setTimeout(() => setHit(false), 1400)
      }}>
      {hit ? 'Copied' : (label ?? 'Copy')}
    </button>
  )
}

function Shell({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="view on">
      <div className="vhead vhrow">
        <h2>Order</h2>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>Back to payments</button>
      </div>
      <div className="vbody">{children}</div>
    </div>
  )
}
