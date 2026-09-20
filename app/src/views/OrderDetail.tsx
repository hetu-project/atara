import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import ConfirmSheet from '../components/ConfirmSheet'
import DisputeForm from '../components/DisputeForm'
import FilePick from '../components/FilePick'
import DocView, { DOC_META } from '../components/DocView'
import Avatar from '../components/Avatar'
import { useAction, useApi } from '../hooks/useApi'
import { useMe } from '../hooks/useMe'
import CopyButton from '../components/CopyButton'
import { Row } from '../components/prim'
import type { Order } from '../api/types'
import { scoreBand, scoreText } from '../api/types'

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
 * 剩余时间。单位要一直看得出来。
 *
 * 原来只有 `mm:ss` 一种写法，于是四小时的付款窗口渲染成 `240:00`，然后
 * 239:59、239:58 一路往下——没有任何地方写着那是分钟。看的人只能猜，而这个
 * 数正是「错过会记进成绩单」的那个数，猜错的代价不是看错一眼。
 *
 * 分三档，每一档都带着单位：
 *   ≥ 1 天   `14d 2h`   —— 凭证档的异议窗口、兜底转人工
 *   ≥ 1 小时 `3h 58m`   —— 法币腿、核验窗口。到这个尺度上秒是噪音
 *   其余     `9:58`     —— 秒开始有意义了，用大家都认得的钟面写法
 *
 * 不做成「4 小时 / 4h」这种整数近似：窗口快走完时，`0h` 和 `12m` 是两件
 * 完全不同的事。
 */
const leftText = (s: number) => {
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 一张工单的全过程，与 console.html 的 .deal 卡同构：
 * 状态行（可折叠）→ 轨道 → 主数字 → KV 组 → 说明句 → 动作行。
 *
 * 轮询 1 秒：s1 的绑定、s4 的放款都是后端调度器推的，不轮询看不到状态变化；
 * 演示口径下各站只有几秒，轮询必须比它快。
 */
/**
 * @param bare 只出这张卡，不套页面外壳。参照里工单卡是长在对话流里的
 *   （.deal 直接挂在 #log 下面），不是另开一页——「他说发货了」和「这单
 *   还等着凭证」摆在一起才对得上号。
 */
export default function OrderDetail({
  id, onBack, bare, identity, order, onChanged,
}: {
  id: string
  onBack: () => void
  bare?: boolean
  identity?: string
  /** The order, when the caller already has it. Given this, the card renders
      what it was handed and fetches nothing. */
  order?: Order
  /** Ask the owner of that data to refresh, after an action changed the order. */
  onChanged?: () => void
}) {
  /* Fetch only when nobody handed us the order.
   *
   * Every card used to poll for itself once a second. In a conversation the
   * cards are one per order, so a thread with seven of them asked the server
   * seven times a second for rows the thread had already fetched — the same DTO,
   * from the same poll, three seconds earlier. Seven requests, seven identical
   * answers, and each one costs two chain round trips on the backend.
   *
   * The standalone /order/:id page has no such parent, so it still fetches, and
   * still polls: the scheduler moves that order along while the page is open. */
  const own = useApi(
    () => (order ? Promise.resolve(order) : ep.order(id)),
    [id, order], order ? undefined : 15000)
  const o = order ?? own.data
  const error = order ? null : own.error
  const reload = onChanged ?? own.reload

  /* Standalone page only: when a parent handed us the order, that parent is the
     one listening, and refetching here as well would ask twice for one change.
     15s is the backstop for a stream that dropped without either end noticing. */
  useEffect(() => {
    if (order) return
    addEventListener(LIVE_CHANGED, own.reload)
    return () => removeEventListener(LIVE_CHANGED, own.reload)
  }, [order, own.reload])
  /* The countdown runs off the deadline, on a local clock.

     `seconds_left` is computed on the server when the row is built, so a card
     rendering it directly only moves when the order is refetched — every 15s
     on the standalone page, and only on a change event inside a thread. The
     number sat still for ten seconds and then jumped, which reads as a frozen
     page rather than a running window.

     `state_deadline` is an instant, so it can be counted down from here once a
     second without asking anyone. It falls back to the server's number while
     the deadline is absent — old rows have no deadline stored. */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const { run, pending, error: actErr } = useAction()
  const [open, setOpen] = useState(true)
  /* 下单前那一道确认。开着的时候装的就是这一单——不另存一份参数，
     人看到的和发出去的必须是同一个东西。 */
  const [ask, setAsk] = useState(false)
  const [disp, setDisp] = useState(false)
  /* The pages uploaded and not yet submitted. Two separate steps on purpose —
     see the footer — and a list rather than one file because a transfer is
     frequently more than one image: the payment screen, the bank's
     confirmation, a statement line when neither shows the reference. */
  const [pages, setPages] = useState<{ ref: string; name: string; url?: string }[]>([])
  /* One /me for the whole application, not one per card: the wallet kind is a
     property of the person, and fourteen cards asked fourteen times for the same
     answer. The comment here used to claim "one for the whole page" while the
     call sat inside the card — see useMe for what those queued requests cost. */
  const me = useMe()
  const walletKind = me?.wallet_kind === 'ext' ? 'ext' : 'atara'

  const wrap = (node: React.ReactNode) =>
    bare ? <>{node}</> : <Shell onBack={onBack}>{node}</Shell>
  if (error) return wrap(<div className="mkempty">{error.message}</div>)
  if (!o) return wrap(<div className="mkempty">Loading the order…</div>)

  /* Prefer the deadline over the server's count — see the ticker above. Both
     floor at zero so an expired window reads as gone, not as a negative. */
  const left = o.state_deadline
    ? Math.max(0, Math.round((new Date(o.state_deadline).getTime() - now) / 1000))
    : Math.max(0, o.seconds_left)

  const act = async (fn: () => Promise<unknown>) => { await run(fn); reload() }
  /* your_side, not side: `side` is the taker's direction and is the same string
     for both parties, so the maker used to read the whole card from the taker's
     seat — "their coins were returned" about his own coins. */
  const sell = (o.otc?.your_side ?? o.otc?.side) === 'sell'
  const coin = `${Number(o.amount.amount).toLocaleString()} ${o.amount.asset}`
  const ccy = o.otc?.fiat_code ?? 'CNY'
  const fiat = money(Number(o.otc?.fiat_amount ?? 0), ccy)
  /* A finished order is not one outcome but three, and they need different
     words. Collapsing them into a single "dead" step meant a disputed order was
     shown as "Payment window missed — their coins were returned and the miss
     recorded against your score": wrong about what happened, wrong about where
     the money is (still locked, awaiting a ruling) and wrong about the
     consequence (no default was recorded). `completed` keeps falling through to
     the s5 copy, which already reads as a settlement. */
  const step = o.terminal && o.terminal !== 'completed' ? o.terminal : o.state
  /* Finished without settling: the rail stops where it is and has no current
     stop — marking the first one as `now` reads as "just started". */
  const ended = step === 'expired' || step === 'cancelled' || step === 'disputed'
  const idx = ended ? -1
    : ({ match: 0, s1: 1, s3: 2, s3v: 3, s4: 3, s5: 4 } as Record<string, number>)[step] ?? 0
  /* `yours` is the taker. The match stop used to count as mine for both sides,
     so the maker got Confirm and Drop too — and both came back 403, because the
     backend only lets the owner move a match. Nothing was ever at risk; the
     buttons were just an invitation to an error. The maker committed when his
     listing locked the coins, so at this stop he has nothing to do but wait. */
  const yours = o.yours !== false
  const mine = o.actor === 'you' || (step === 'match' && yours)
  /* A dispute is not over — the funds are still in the contract and a ruling is
     pending — but nobody on this screen can move it either, so it renders like
     a closed order rather than one with actions. */
  const over = step === 's5' || ended

  const badge = ({
    match: 'Pending', s1: sell ? 'Escrowing' : 'Waiting',
    s3: sell ? 'Waiting' : 'Your turn', s3v: 'Verifying', s4: 'Verifying',
    s5: 'Done',
    expired: 'Timed out', cancelled: 'Cancelled', disputed: 'In dispute',
  } as Record<string, string>)[step] ?? 'In progress'

  /* 状态行那句话按买卖方向分叉——两侧看到的事实本来就不一样 */
  const line = sell ? ({
    match: <>Sell {coin} for <b className="amt">{fiat}</b></>,
    s1: <>Sell {coin} for <b className="amt">{fiat}</b> · your coins locking into escrow</>,
    s3: <>Waiting on their <b className="amt">{fiat}</b> · your {coin} is safe in escrow</>,
    s3v: <>Their receipt is in · <b className="amt">{fiat}</b> reported sent</>,
    s4: <>Verifying their receipt · <b className="amt">{fiat}</b> reported sent</>,
    s5: <><b className="amt">{fiat}</b> received · performance written back to score</>,
    expired: <>Their payment window missed · your {coin} returned from escrow</>,
    cancelled: <>Order cancelled · your {coin} returned from escrow</>,
    disputed: <>In dispute · your {coin} stays locked until this is settled</>,
  } as Record<string, JSX.Element>)[step] : ({
    match: <>Buy {coin} for <b className="amt">{fiat}</b></>,
    s1: <>Buy {coin} for <b className="amt">{fiat}</b> · verifying their escrow</>,
    s3: <>Your turn — pay <b className="amt">{fiat}</b> · their {coin} is in escrow</>,
    s3v: <>Verifying receipt · <b className="amt">{fiat}</b> sent</>,
    s4: <>Verifying receipt · <b className="amt">{fiat}</b> sent</>,
    s5: <><b className="amt">{coin}</b> credited · performance written back to score</>,
    expired: <>Payment window missed · their {coin} was returned</>,
    cancelled: <>Order cancelled · their {coin} was returned</>,
    disputed: <>In dispute · the {coin} stays locked until this is settled</>,
  } as Record<string, JSX.Element>)[step]

  return wrap(
    <>
      <div className={'deal' + (mine ? ' mine' : '') + (over ? ' done' : '') + (open ? ' xopen' : '')}>
        <div className="row1" role="button" tabIndex={0} aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) } }}>
          <span className="st">{badge}</span>
          <span className="dsum">{line}</span>
          {left > 0 && (
            <span className={'cd num' + (left <= 120 ? ' tight' : '')}
              title="Miss this window and the coins return — recorded as a default">
              {leftText(left)}
            </span>
          )}
          <span className="dchev" aria-hidden>⌃</span>
        </div>

        <div className="open"><div className="openin">
          <Rail at={idx} sell={sell} />
          <div className="pad">
            {step === 'match' && yours ? (
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
                  {/* 确认之前再停一下：这一下之后付款窗口就开始走，错过会
                      记进你的成绩单。参照在这里也插了一道。 */}
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => setAsk(true)}>Confirm</button>
                </div>
              </>
            ) : step === 's3' && o.phase === 'pay' ? (
              <>
                <div className="dhead">
                  <b className="damt num">Transfer {fiat}</b>
                  <span className="dsub">to the account below, then upload the receipt</span>
                </div>

                {/* 跟这张卡别的阶段同一种排版:标签在左、值在右、发丝线分行。

                    这里一度改成「标签大写压在值上面」那一套,于是同一张卡走到
                    下一步就换了一种语言,而它明明还是那张卡。要抄进银行 App 的
                    两样各带一颗复制键,那是这一步的重点——重点不必靠另起一套
                    排版来强调。 */}
                <dl className="dpay">
                  {o.payout ? (
                    <>
                      <div><dt>Pay to</dt><dd>
                        <b>{o.payout.holder}</b>
                        <span className="dmono">{o.payout.bank}</span>
                      </dd></div>
                      <div><dt>Account</dt><dd>
                        <span className="dmono">{o.payout.account_no}</span>
                        {/* 号码是手抄进银行 App 的,给复制键而不是让人对着念。 */}
                        <CopyButton text={o.payout.account_no} label="Copy account number"
                          done="Account number copied" className="cpbtn" />
                        <span className="dreq">{o.payout.region}</span>
                      </dd></div>
                    </>
                  ) : (
                    /* 说清楚缺的是哪一半。「问对方要」是唯一剩下的动作,而它
                       只在人知道这里没有东西在加载时才说得通。 */
                    <div><dt>Pay to</dt><dd>
                      <span style={{ color: 'var(--warn)' }}>
                        No account on file — ask them for their bank details before
                        sending anything.
                      </span>
                    </dd></div>
                  )}
                  <div><dt>Escrow</dt><dd>
                    <span className="esok">✓ {coin} locked</span>
                    <span className="dmono">
                      {o.escrow?.tx_hash
                        ? `tx ${o.escrow.tx_hash.slice(0, 6)}…${o.escrow.tx_hash.slice(-4)}`
                        : 'bound to this order'}
                      {o.escrow?.funding_via && o.escrow.required
                        ? ` · ${o.escrow.confirmations}/${o.escrow.required} confirmations` : ''}
                    </span>
                  </dd></div>
                  <div><dt>Reference</dt><dd>
                    {/* 附言是唯一必须原样到达银行的字符串——一次没复制成功,
                        事后就是一笔没人能对上号的汇款。 */}
                    <span className="dmono">{o.ref}</span>
                    <CopyButton text={o.ref} label="Copy reference"
                      done="Reference copied" className="cpbtn" />
                    <span className="dreq">required</span>
                  </dd></div>
                </dl>

                <p className="dmech">
                  Miss the window and it returns to them, recorded as a default.
                </p>

                {pages.length > 0 && (
                  <div className="rclist">
                    {pages.map((f, i) => (
                      <Row key={f.ref} lead={i + 1} title={f.name}
                        trail={
                          <>
                            {/* 打开看一眼是唯一能确认传对了的办法——文件名
                                证明不了什么,手机相册里每张照片名字都一样。 */}
                            {f.url && (
                              <a className="lnk" href={f.url} target="_blank" rel="noopener">View</a>
                            )}
                            <button type="button" className="rcx"
                              aria-label={`Remove ${f.name}`}
                              onClick={() => setPages(p => p.filter(x => x.ref !== f.ref))}>×</button>
                          </>
                        } />
                    ))}
                    <span className="rchint">
                      {pages.length} {pages.length === 1 ? 'file' : 'files'} · not sent yet
                    </span>
                  </div>
                )}

                <div className="dfoot">
                  <a href="#" className="lnk ecancel" style={{ marginRight: 'auto' }}
                    onClick={e => { e.preventDefault(); void act(() => ep.cancel(o.id)) }}>Cancel order</a>
                  {/* 付款这一步最容易出事——钱已经出去了,对方却说没收到。
                      出口得在这儿,而不是等人去找客服。 */}
                  <a href="#" className="lnk dspx"
                    onClick={e => { e.preventDefault(); setDisp(true) }}>Report a problem</a>
                  <FilePick variant="button" label={pages.length ? 'Add another' : 'Upload receipt'}
                    identity={identity}
                    disabled={pending || pages.length >= MAX_PAGES}
                    className={pages.length ? 'btn-secondary' : ''}
                    onDone={(ref, meta) => setPages(p =>
                      p.some(x => x.ref === ref) ? p : [...p, { ref, ...meta }])} />
                  {pages.length > 0 && (
                    <button className="btn btn-primary" disabled={pending}
                      onClick={() => void act(async () => {
                        await ep.receipt(o.id, pages.map(f => f.ref))
                        setPages([])
                      })}>Submit {pages.length > 1 ? `${pages.length} files` : 'receipt'}</button>
                  )}
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

      {disp && (
        <DisputeForm orderId={o.id} ref_={o.ref}
          who={o.counterparty_name ?? '—'}
          amount={`${coin} · ${fiat}`}
          identity={identity ?? ''}
          onClose={() => setDisp(false)}
          onDone={() => { setDisp(false); reload() }} />
      )}

      {ask && (
        <ConfirmSheet
          title="Confirm order"
          amount={money(Number(o.otc?.fiat_amount ?? 0), ccy).replace(/\s.*$/, '')}
          walletKind={walletKind}
          /* 买方接单不动自己的钱——对方的币早锁在合约里了，我之后才去银行
             转账。所以是普通按钮。卖方接单要把币锁进合约，那一下才走签名。 */
          plain={sell ? undefined : 'Confirm order'}
          busy={pending}
          lead={<>
            {sell ? 'Sell' : 'Buy'} <b className="num">{coin}</b>{' '}
            {sell ? 'to' : 'from'} <b>{o.counterparty_name ?? 'them'}</b>.{' '}
            {sell
              ? 'Your coins lock into escrow when you confirm.'
              : 'Their coins are already escrowed — locked when they listed.'}
          </>}
          rows={[
            { k: 'You pay',
              v: sell
                ? <>{coin} · into escrow</>
                : <>{fiat} · bank transfer, outside Atara</> },
            { k: sell ? 'They pay' : 'Their account',
              v: sell ? <>{fiat} · to your registered account</> : <>Full details on the next step</> },
            /* 窗口是这张卡上唯一一个「错过有后果」的数，所以它单独一行，
               而不是塞进上面那句话里。 */
            /* 4 小时与轨道上那一站写的是同一个窗口。写死在两处是有风险的，
               但这个数现在只由后端的 demo/real 计时决定，接口上没有发下来。 */
            { k: 'Window', v: <>4 h · missing it marks your record</> },
          ]}
          onConfirm={() => { setAsk(false); void act(() => ep.accept(o)) }}
          onClose={() => setAsk(false)} />
      )}
    </>,
  )
}

/** Rail. Stop names fork by side: the buyer verifies a lock, the seller funds it. */
function Rail({ at, sell }: { at: number; sell: boolean }) {
  /* The live clock lives in the header. Putting a window on this stop as well
     made the same card say "8 min" and "7:33" at once. */
  const stops: [string, string][] = sell
    ? [['Matched', ''], ['Escrow funded', '~2 min'], ['Their transfer', ''], ['Verify & release', '~2 min']]
    : [['Matched', ''], ['Escrow verified', 'seconds'], ['Your transfer', ''], ['Verify & release', '~2 min']]
  return (
    <div className="erail">
      {stops.map(([n, eta], k) => (
        <span key={n} className={'es ' + (k < at ? 'done' : k === at ? 'now' : '')}>
          <i />{n}{k === at && eta ? ` · ${eta}` : ''}
        </span>
      ))}
    </div>
  )
}

/* Mirrors maxReceiptPages on the server. Not a storage limit — it is the point
   past which nobody reads them, and a verifier facing thirty images stops
   checking and starts guessing. Enforced there too; this only keeps the button
   from offering something that would be refused. */
const MAX_PAGES = 8

/** 资质件六项。缺件也照实显示——让对方自己给缺口定价，不替他隐藏。 */
const DOCS: [string, string][] = [
  ['kyc', 'KYC'], ['pof', 'PoF'], ['stm', 'Stmts'],
  ['poa', 'PoA'], ['sow', 'SoW'], ['chain', 'Chain'],
]

/** 对手方那几行在每个阶段都长一样，抽出来。 */
function Peer({ o, ccy }: { o: Order; ccy: string }) {
  const name = o.counterparty_name ?? '—'
  const p = o.peer_profile
  /* 点开的是这份材料的说明——它是什么、谁出的、这一家交没交。 */
  const [doc, setDoc] = useState('')
  return (
    <dl className="dpay">
      <div><dt>Counterparty</dt>
        <dd><span className="cplink still"><Avatar name={name} />{name}</span></dd></div>
      {/* 成绩单和资质件是决定要不要跟这个人做这一单的依据，所以摆在
          金额旁边，不是藏在对方主页里。数据跟工单一起来，两个数同一时刻。 */}
      {p && (
        <div><dt>Track record</dt>
          <dd>{p.deals} trades · {p.disputes} disputes · {scoreText(p.trust_score)}</dd></div>
      )}
      {p?.docs && (
        <div><dt>Documents</dt>
          <dd className="dpay-docs">
            {DOCS.map(([k, label]) => (
              <button key={k} type="button" className={'doc' + (p.docs?.[k] ? ' on' : '')}
                title={DOC_META[k]?.n} onClick={e => { e.stopPropagation(); setDoc(k) }}>
                {p.docs?.[k] ? '✓' : '✕'} {label}
                <span className="docgo" aria-hidden>›</span>
              </button>
            ))}
          </dd></div>
      )}
      <div><dt>Settles in</dt>
        <dd><span className="flg">{flag(ccy)}</span>{ccy} — {FIAT_NAME[ccy] ?? ccy}</dd></div>
      <div><dt>Amount</dt>
        <dd>{Number(o.amount.amount).toLocaleString()} {o.amount.asset}</dd></div>
      {o.fee && Number(o.fee.amount) > 0 && (
        <div><dt>Fee</dt>
          {/* 手续费按原样印，不四舍五入到整。money() 是给几万块的金额用的，
              用在 29.28 上会印成「¥29」——抹掉的正好是这个数的大部分。 */}
          <dd>{FIAT_SYM[o.fee.currency] ?? ''}{o.fee.amount} {o.fee.currency}{' '}
            <span className="dreq">{o.fee.bps / 100}%</span></dd></div>
      )}
      {/* The receipt itself, wherever this table appears while the order is
          still open. The verify step used to ask "check it landed before
          releasing" and then show everything except the thing being checked —
          the person holding the money had to decide on a file they could not
          open. The settled view leaves this out because the evidence pack below
          already carries it with its verification timestamp. */}
      {o.otc?.receipt_url && !o.terminal && (
        <div><dt>Receipt</dt>
          <dd>
            <a className="lnk" href={o.otc.receipt_url} target="_blank" rel="noopener"
              onClick={e => e.stopPropagation()}>Open original ↗</a>
            <span className="dreq" style={{ marginLeft: 8 }}>
              uploaded by the paying side
            </span>
          </dd></div>
      )}
      {doc && (
        <DocView doc={doc} has={!!p?.docs?.[doc]} peer={name} onClose={() => setDoc('')} />
      )}
      {/* 对手方的分,下单那一刻定的快照。

          跟 Discover 上那个环是**同一个数**——它们本来是两个各算各的函数,
          于是同一张卡上并排着 74 和 56,谁也解释不了对方。现在同源。

          存快照而不是现算:重算的话,历史单的分会跟着这个商户后来的成交和
          纠纷变,而这个数说的是「下单那一刻我们怎么看他」。 */}
      {/* 文案跟 Discover 上那个环逐字一致:同一个数,两处叫法不同的话,
          人会以为是两个东西——而它们本来就是被当成两个东西的。 */}
      <div><dt>{o.trust_score === null ? 'Not rated' : 'AI score'}</dt>
        <dd>
          {o.trust_score === null ? (
            <span className="dreq" style={{ marginLeft: 0 }}>
              No settled trades yet when this order was placed
            </span>
          ) : (
            <>
              <b className={'num ' + scoreBand(o.trust_score)}>{o.trust_score}</b>
              <span className="dreq" style={{ marginLeft: 8 }}>
                scored when the order was placed
              </span>
            </>
          )}
        </dd></div>
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
    /* The maker's side of the match stop. Without it this fell through to the
       "In progress" fallback — a blank wait with no reason given, right after
       someone took his listing. */
    match: [`Waiting on ${o.counterparty_name ?? 'them'} to confirm`,
      `Your ${coin} is already locked in the contract · if they do not confirm, the match lapses`],
    s1: ['Locking your coins', o.escrow?.funding_via === 'external'
      ? 'From your external wallet — detection is automatic'
      : 'Signed from your wallet · confirming on-chain'],
    s3: [`Waiting on ${o.counterparty_name ?? 'them'}`,
      `They send ${fiat} to your registered account, then upload the receipt`],
    s3v: ['Their receipt is in', 'Check it against your account before releasing'],
    s4: ['Verifying their receipt', 'Amount, reference and sender name are checked against the escrow'],
    s5: [`${fiat} received`, 'Escrow released to them · performance written back to both records'],
    expired: ['Their payment window missed', `Your ${coin} came back from escrow · their miss recorded`],
    cancelled: ['Order cancelled', `Your ${coin} came back from escrow · no default recorded`],
    disputed: ['In dispute — under review',
      `Your ${coin} stays locked in the contract until this is settled`],
  } : {
    match: [`Waiting on ${o.counterparty_name ?? 'them'} to confirm`,
      'Nothing moves until they do · if they do not confirm, the match lapses'],
    s1: ['Verifying their escrow', 'Locked when they listed — binding it to this order'],
    s3: [`Waiting on ${o.counterparty_name ?? 'them'}`, 'They are sending the transfer'],
    s3v: ['Waiting on their check', 'They confirm the money landed, then escrow releases'],
    s4: ['Verifying your receipt', 'Amount, reference and sender name are checked against the escrow'],
    s5: [`${coin} credited`, 'Settled in full · performance written back to their score'],
    expired: ['Payment window missed', `Their ${coin} was returned and the miss recorded against your score`],
    cancelled: ['Order cancelled', `Their ${coin} was returned · no default recorded`],
    disputed: ['In dispute — under review',
      `The ${coin} stays locked in the contract until this is settled`],
  }
  const mech: Record<string, string> = {
    match: 'The side that took the listing confirms — you committed when the listing '
      + 'locked your coins. A lapsed match is recorded as unfilled, not as a default.',
    s1: sell
      ? 'Your coins sit in the escrow contract — not with Atara, not with them. They release only when the buyer’s payment clears verification.'
      : 'Locked at listing, bound to your order now. If the binding fails, the trade closes — no exposure to you.',
    s3: 'Your coins stay locked while they pay. If the window lapses, escrow returns them automatically.',
    s3v: 'Release is automatic once the receipt is confirmed. Neither side can hold the funds back.',
    s4: 'Release is automatic once the receipt matches. Neither side can hold the funds back.',
    s5: 'The evidence pack is the settlement record — receipt, escrow release and both signatures.',
    expired: 'Funds returned automatically — nothing was held. The miss stays on the record.',
    cancelled: 'Funds returned automatically — nothing was held, and no default was recorded.',
    /* Say where the money is and who moves next. Without this the screen goes
       quiet after the most alarming action on it, and the person who just
       raised the dispute has no way to tell whether anything is happening. */
    disputed: 'The funds stay in the contract — neither side can move them. '
      + 'A reviewer decides whether they are released or returned.',
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
      {o.evidence && <Pack ev={o.evidence} coin={coin} fiat={fiat} ref_={o.ref} />}
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

/**
 * 证据包 —— 这单最后凭什么收的口。
 *
 * 参照里 s5 那行的「Evidence ›」点开的就是这张卡本身（链接在 .row1 里，
 * 点击冒泡上去把卡展开），所以它不是另一张卡，是同一张卡的终态。工单接口
 * 一个就够，用户自己也看出来了：两张截图内容一样，只是状态不同。
 *
 * 三样东西，缺哪样就不显示哪样——证据包的意义在于「这些是真的发生过的」，
 * 补一行占位就把它变成了装饰：
 *   银行凭证   付款方交上来的那份文件，点开是原件
 *   链上流水   锁仓 / 绑定 / 放款，每一步带哈希，能到浏览器上自己核
 *   结算时刻   核验通过的那一刻
 */
const KIND: Record<string, string> = {
  lock: 'Coins locked in escrow',
  bind: 'Escrow bound to this order',
  release: 'Escrow released',
  refund: 'Escrow returned',
  deposit: 'Deposit received',
}

function Pack({ ev, coin, fiat, ref_ }: {
  ev: NonNullable<Order['evidence']>; coin: string; fiat: string; ref_: string
}) {
  const done = ev.outcome === 'completed'
  const rows = ev.chain ?? []
  if (!ev.receipt_ref && !rows.length) return null
  return (
    <div className="eswin evpack">
      <div className="fal">
        <span>Evidence pack · {ref_}</span>
        <b>{done ? `${coin} → ${fiat}` : ev.outcome}</b>
      </div>
      {ev.receipt_url && (
        <div className="evrow">
          <i className="ok" />
          <span>Bank receipt</span>
          {/* 打开的是当时交上来的原件，不是一个「已上传」的字样 */}
          <a href={ev.receipt_url} target="_blank" rel="noopener"
            /* 链接文字不印 file_ref：那是一个 uuid，对人没有任何意义，
               而这一行左边已经说了它是什么。 */
            onClick={e => e.stopPropagation()}>Open original ↗</a>
          {/* settled_at 是回执核验通过的时刻，不是放款时刻——放款在它之后。
              单独排一行「Settled」会排在放款下面，时间却更早，整列读下来
              像时间倒流了。它属于这份回执，就跟着回执。 */}
          {ev.settled_at && <time>verified {new Date(ev.settled_at).toLocaleString()}</time>}
        </div>
      )}
      {rows.map((c, i) => (
        <div className="evrow" key={c.tx_hash || c.kind + i}>
          <i className="ok" />
          <span>{KIND[c.kind] ?? c.kind}</span>
          {c.tx_hash && (c.explorer
            ? <a href={c.explorer} target="_blank" rel="noopener" className="num"
              onClick={e => e.stopPropagation()}>
              {c.tx_hash.slice(0, 8)}…{c.tx_hash.slice(-6)} ↗
            </a>
            : <em className="num">{c.tx_hash.slice(0, 8)}…{c.tx_hash.slice(-6)}</em>)}
          <time>{new Date(c.at).toLocaleString()}</time>
        </div>
      ))}
    </div>
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
