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
import { useWalletTx } from '../hooks/useWalletTx'
import CopyButton from '../components/CopyButton'
import { Row } from '../components/prim'
import type { ChainInfo, Order, Wallet } from '../api/types'
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
/* The fiat leg to the cent. This used to Math.round: 2 USDT at 7.3 showed as
   ¥15 against a bank transfer of ¥14.60, and the receipt never matched the
   number on screen. Whole amounts still print whole; anything else keeps its
   two decimals, which is what the bank shows. */
const money = (v: number, c: string) =>
  `${FIAT_SYM[c] ?? ''}${Number.isInteger(v)
    ? v.toLocaleString()
    : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`

/**
 * Time remaining. The unit has to stay legible throughout.
 *
 * It used to have one format, `mm:ss`, so a four-hour payment window rendered as `240:00`, then 239:59, 239:58 and
 * on down -- with nothing anywhere saying those were minutes. The reader could only guess, and this number is
 * precisely the one where missing it goes on your record, so guessing wrong costs more than a misread.
 *
 * Three bands, each carrying its unit:
 *   >= 1 day   `14d 2h`   -- the evidence tier's dispute window, the fallback to human review
 *   >= 1 hour  `3h 58m`   -- the fiat leg, the verification window. Seconds are noise at this scale
 *   otherwise  `9:58`     -- seconds start to matter, written in the clock format everyone recognises
 *
 * No rounding to whole units like "4 hours / 4h": as a window runs out, `0h` and `12m` are two completely
 * different things.
 */
const leftText = (s: number) => {
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The whole course of one ticket, isomorphic with console.html's .deal card:
 * status line (collapsible) -> track -> headline figure -> KV groups -> explanation -> action row.
 *
 * Polled at 1 second: s1's binding and s4's release are both pushed by the backend scheduler, and without polling
 * the state changes are invisible; in demo terms each station lasts only seconds, so polling has to be faster.
 *
 * @param bare Render only this card, with no page shell. In the reference the ticket card grows inside the
 *   conversation stream (.deal hangs directly under #log) rather than on a separate page -- "he says he shipped"
 *   and "this order is still waiting on proof" only line up when placed together.
 */
export default function OrderDetail({
  id, onBack, bare, identity, order, onChanged,
  chains: chainsIn, myWallet: walletIn,
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
  /** The chain config and this account's wallet, when the caller already has
      them. Neither varies per order — one is which chain the backend is on,
      the other is whose money this is — so a parent rendering many cards
      should read them once and hand them down. Same arrangement as `order`
      above, for the same reason. */
  chains?: ChainInfo | null
  myWallet?: Wallet | null
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
  /* The confirmation before ordering. While open it holds this very order -- no second copy of the parameters is
     kept, because what the person sees and what goes out must be the same object. */
  const [ask, setAsk] = useState(false)
  /* Drop / cancel / reject close money-adjacent state. One more click,
     because a missed tap on a text link used to unwind escrow. */
  const [quit, setQuit] = useState<null | 'drop' | 'cancel' | 'reject'>(null)
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
  /* The chain this order settles on, for the one transaction this card may
     have to send: a seller's deposit into escrow. On a real chain that must
     come from the taker's own wallet -- the backend refuses to sign it (see
     Accept's EXTERNAL_WALLET_REQUIRED), because it would be signing with the
     platform's key and the contract would record the platform as payer. */
  /* Fetch only when nobody handed them over, exactly as with `order`.

     A conversation renders one card per order, so a thread of twenty-one
     asked for these forty-two times and got the same two answers. The
     endpoints dedupe now (see api/share.ts), which alone stops the flood —
     but a card asking the network for something its parent is already holding
     is the shape of the problem, and the dedupe is only a floor under it.

     The standalone /order/:id page has no parent to hand them over, so it
     still reads them itself. */
  const ownChains = useApi(
    () => (chainsIn !== undefined ? Promise.resolve(chainsIn) : ep.chainInfo()), [chainsIn])
  const ownWallet = useApi(
    () => (walletIn !== undefined ? Promise.resolve(walletIn) : ep.wallet(identity)),
    [walletIn, identity])
  const chains = chainsIn !== undefined ? chainsIn : ownChains.data
  const myWallet = walletIn !== undefined ? walletIn : ownWallet.data
  const chainRow = (chains?.chains ?? []).find(c => c.code === (o?.escrow?.network || o?.otc?.network)) ?? null
  const wtx = useWalletTx(chainRow, myWallet?.address)

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
  /* The seller's deposit, sent from their own wallet with the parameters the
     backend put on the order (key, token, wei, beneficiary) -- nothing hashed
     or scaled here. Callable again from the s1 card if the first attempt was
     declined in the wallet. */
  const fundFromWallet = async () => {
    const e = o.escrow
    if (!e?.order_key || !e.token || !e.amount_wei || !e.beneficiary) {
      throw new Error('Funding details are not on the order yet — reload and try again')
    }
    await wtx.deposit({
      escrow: e.contract, token: e.token, orderKey: e.order_key,
      amountWei: e.amount_wei, beneficiary: e.beneficiary,
    })
  }
  /* Buying: a plain commitment, the maker's coins are already escrowed.
     Selling on a real chain: commit with via=external, then deposit from the
     wallet. Selling on the mock chain: the old path, the backend signs. This
     used to call ep.accept(o) for both sides, which on a real chain made the
     backend fund the escrow with the platform's own coins. */
  const acceptOrder = async () => {
    if (!sell || chains?.impl !== 'evm') { await ep.accept(o); return }
    const fresh = await ep.accept(o, 'external')
    const e = fresh.escrow
    if (!e?.order_key || !e.token || !e.amount_wei || !e.beneficiary) return // the s1 card offers the deposit
    await wtx.deposit({
      escrow: e.contract, token: e.token, orderKey: e.order_key,
      amountWei: e.amount_wei, beneficiary: e.beneficiary,
    })
  }
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
  /* `released` is the conditional flow's settled state; an OTC trade settles at
     s5. A dispute resolved in the buyer's favour used to land OTC orders in the
     former, and every map below is keyed on OTC states — so the order fell
     through to `?? 0` and read as "In progress · Matched", the first step of a
     trade that had already finished. The backend now picks the state by kind;
     this normalisation keeps orders settled before that fix readable too. */
  const state = o.kind === 'otc_take' && o.state === 'released' ? 's5' : o.state
  const step = o.terminal && o.terminal !== 'completed' ? o.terminal : state
  /* A dispute the clock raised, not a person. The verification window closed
     with nobody having spoken, so the coins froze and a reviewer was asked —
     but the receipt is still sitting there unread, and the side it is
     addressed to can still clear it and finish the trade.

     The backend decides this, not the card: PhaseFor hands back a phase for an
     escalated dispute and nothing at all for a contested one, which is the
     same rule that decides whether the API would accept the click. Reading it
     off `phase` keeps the two from drifting apart. */
  const escalated = step === 'disputed' && !!o.phase

  /* Finished without settling: the rail stops where it is and has no current
     stop — marking the first one as `now` reads as "just started". */
  const ended = !escalated && (step === 'expired' || step === 'cancelled' || step === 'disputed')
  const idx = ended ? -1
    : escalated ? 3
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
    // Not 'In dispute': nobody is accusing anybody, and the trade can still
    // finish without a ruling.
    escalated: 'Overdue',
    expired: 'Timed out', cancelled: 'Cancelled', disputed: 'In dispute',
  } as Record<string, string>)[escalated ? 'escalated' : step] ?? 'In progress'

  /* The status line's sentence forks by buy/sell direction -- the facts the two sides see genuinely differ */
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
    escalated: <>Verification overdue · your {coin} stays locked until you confirm or a reviewer decides</>,
  } as Record<string, JSX.Element>)[escalated ? 'escalated' : step] : ({
    match: <>Buy {coin} for <b className="amt">{fiat}</b></>,
    s1: <>Buy {coin} for <b className="amt">{fiat}</b> · verifying their escrow</>,
    s3: <>Your turn — pay <b className="amt">{fiat}</b> · their {coin} is in escrow</>,
    s3v: <>Verifying receipt · <b className="amt">{fiat}</b> sent</>,
    s4: <>Verifying receipt · <b className="amt">{fiat}</b> sent</>,
    s5: <><b className="amt">{coin}</b> credited · performance written back to score</>,
    expired: <>Payment window missed · their {coin} was returned</>,
    cancelled: <>Order cancelled · their {coin} was returned</>,
    disputed: <>In dispute · the {coin} stays locked until this is settled</>,
    escalated: <>They did not check in time · the {coin} stays locked, nothing was returned</>,
  } as Record<string, JSX.Element>)[escalated ? 'escalated' : step]

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
              title={deadlineHint[step] ?? ''}>
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
                    onClick={e => { e.preventDefault(); setQuit('drop') }}>Drop</a>
                  {/* One more pause before confirming: after this the payment window starts running, and missing it
                      goes on your record. The reference inserts a step here too. */}
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => setAsk(true)}>Confirm</button>
                </div>
              </>
            ) : step === 's1' && sell && yours && o.escrow?.funding_via === 'external'
                && o.escrow.order_key && !o.escrow.tx_hash ? (
              /* The seller committed but the deposit has not landed: the wallet
                 prompt was declined, or the page moved on before it. The order
                 sits at s1 until the contract sees the coins, so the way to
                 send them stays on the card. */
              <>
                <div className="dhead">
                  <b className="damt num">Deposit {coin}</b>
                  <span className="dsub">from your wallet into the escrow contract</span>
                </div>
                <p className="dmech">
                  Your wallet is the payer and {o.counterparty_name ?? 'the buyer'} is the payee on the
                  contract — that cannot change afterwards. Detection is automatic once the deposit confirms.
                </p>
                <div className="dfoot">
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => void act(fundFromWallet)}>Deposit from wallet</button>
                </div>
              </>
            ) : step === 's3' && o.phase === 'pay' ? (
              <>
                <div className="dhead">
                  <b className="damt num">Transfer {fiat}</b>
                  <span className="dsub">to the account below, then upload the receipt</span>
                </div>

                {/* The same layout as this card's other stages: label left, value right, hairline between rows.

                    This was once changed to the "uppercase label above the value" style, so the same card switched
                    language on reaching the next step while still being the same card. The two things to be copied
                    into a banking app each carry a copy button, and that is this step's point -- a point that does
                    not need a second layout language to make it. */}
                <dl className="dpay">
                  {o.payout ? (
                    <>
                      <div><dt>Pay to</dt><dd>
                        <b>{o.payout.holder}</b>
                        <span className="dmono">{o.payout.bank}</span>
                      </dd></div>
                      <div><dt>Account</dt><dd>
                        <span className="dmono">{o.payout.account_no}</span>
                        {/* The number is hand-copied into a banking app, so give a copy button rather than making people read it aloud. */}
                        <CopyButton text={o.payout.account_no} label="Copy account number"
                          done="Account number copied" className="cpbtn" />
                        <span className="dreq">{o.payout.region}</span>
                      </dd></div>
                    </>
                  ) : (
                    /* Say plainly which half is missing. "Ask them for it" is the only action left, and it only makes
                       sense once the person knows nothing is still loading here. */
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
                    {/* The reference is the one string that has to reach the bank verbatim -- one failed copy and it
                        becomes a transfer nobody can reconcile afterwards. */}
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
                            {/* Opening it is the only way to confirm the right thing was uploaded -- a filename
                                proves nothing, and every photo in a phone's camera roll has the same name. */}
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
                    onClick={e => { e.preventDefault(); setQuit('cancel') }}>Cancel order</a>
                  {/* The payment step is where things most often go wrong -- the money has gone out and the other
                      side says it never arrived. The way out has to be here, not somewhere they have to hunt support for. */}
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
            ) : (step === 's3v' || escalated) && o.phase === 'verify' ? (
              <>
                <div className="dhead">
                  <b className="damt num">
                    {escalated ? 'Overdue — you can still release' : 'Verify their receipt'}
                  </b>
                  <span className="dsub">
                    {escalated
                      ? `${fiat} reported sent — the window closed and this went to review`
                      : `${fiat} reported sent — check it landed before releasing`}
                  </span>
                </div>
                <Peer o={o} ccy={ccy} live={escalated} />
                {/* Release is based on the bank receipt, not on either party's willingness to confirm -- hence the payee is the one who verifies */}
                <p className="dmech">
                  {escalated
                    ? 'The coins are frozen — nothing was returned to either side. Confirming the '
                      + 'receipt still releases them and closes the review. Amount, reference and '
                      + 'sender name should match the order.'
                    : 'Release is yours to confirm because the money lands in your account. Amount, '
                      + 'reference and sender name should match the order.'}
                </p>
                <div className="dfoot">
                  <a href="#" className="lnk dspx" style={{ marginRight: 'auto' }}
                    onClick={e => { e.preventDefault(); setQuit('reject') }}>
                    It does not match
                  </a>
                  <button className="btn btn-primary" disabled={pending}
                    onClick={() => void act(() => ep.verifyReceipt(o.id, true))}>Confirm receipt</button>
                </div>
              </>
            ) : (
              <Waiting o={o} sell={sell} step={escalated ? 'escalated' : step}
                coin={coin} fiat={fiat} ccy={ccy}
                canCancel={yours} onCancel={() => setQuit('cancel')}
                onDispute={() => setDisp(true)} pending={pending} />
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

      {quit && (
        <ConfirmSheet
          title={quit === 'drop' ? 'Drop this match' : quit === 'reject' ? 'Reject this receipt' : 'Cancel this order'}
          walletKind={walletKind}
          plain={quit === 'drop' ? 'Drop match' : quit === 'reject' ? 'It does not match' : 'Cancel order'}
          busy={pending}
          lead={quit === 'drop'
            ? <>This match will close. Their listing stays up.</>
            : quit === 'reject'
              ? <>The receipt does not match this order. Escrow stays locked until a reviewer decides.</>
              : <>Close this order. The coins return from escrow.</>}
          note={quit === 'drop'
            ? { why: 'Nothing has moved yet.', how: 'No coins leave escrow, and no default is recorded.' }
            : quit === 'reject'
              ? { why: 'This opens a dispute.', how: 'Use this when the amount, reference, or sender does not match.' }
              : { why: step === 's3'
                  ? 'If you already sent the bank transfer, cancelling will not get that money back.'
                  : 'This closes the trade before escrow is fully in place.',
                  how: 'The coins return from escrow. No default is recorded.' }}
          onConfirm={() => {
            const kind = quit
            void (async () => {
              const ok = kind === 'reject'
                ? await run(() => ep.verifyReceipt(o.id, false, 'Receipt does not match'))
                : await run(() => ep.cancel(o.id))
              if (ok) { setQuit(null); reload() }
            })()
          }}
          onClose={() => setQuit(null)} />
      )}

      {ask && (
        <ConfirmSheet
          title="Confirm order"
          amount={money(Number(o.otc?.fiat_amount ?? 0), ccy).replace(/\s.*$/, '')}
          walletKind={walletKind}
          /* A buyer accepting an order moves none of their own money -- the counterparty's coins were locked in the
             contract long ago and the bank transfer comes later. So an ordinary button. A seller accepting has to
             lock coins into the contract, and only that goes through signing. */
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
            /* The window is the only number on this card where missing it has consequences, so it gets its own line
               rather than being tucked into the sentence above. */
            /* The 4 hours and the station on the track describe the same window. Hardcoding it in two places is a
               risk, but this number is currently decided solely by the backend's demo/real timer and is not sent over the API. */
            { k: 'Window', v: <>4 h · missing it marks your record</> },
          ]}
          onConfirm={() => { setAsk(false); void act(acceptOrder) }}
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

/** The six qualification documents. Missing ones are shown truthfully -- let the other side price the gap rather than hiding it for them. */
const DOCS: [string, string][] = [
  ['kyc', 'KYC'], ['pof', 'PoF'], ['stm', 'Stmts'],
  ['poa', 'PoA'], ['sow', 'SoW'], ['chain', 'Chain'],
]

/** The counterparty rows look the same at every stage, so they are extracted. */
function Peer({ o, ccy, live }: { o: Order; ccy: string; live?: boolean }) {
  const name = o.counterparty_name ?? '—'
  const p = o.peer_profile
  /* What opens is the description of this document -- what it is, who issues it, and whether this party submitted it. */
  const [doc, setDoc] = useState('')
  return (
    <dl className="dpay">
      <div><dt>Counterparty</dt>
        <dd><span className="cplink still"><Avatar name={name} />{name}</span></dd></div>
      {/* The scorecard and qualification documents are the basis for deciding whether to do this order with this
          person, so they sit beside the amount rather than being buried on their profile. The data arrives with the
          ticket, so both numbers come from the same moment. */}
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
          {/* The fee is printed as-is, not rounded to whole units. money() is for amounts in the tens of thousands;
              used on 29.28 it prints "29" -- dropping most of the number. */}
          <dd>{FIAT_SYM[o.fee.currency] ?? ''}{o.fee.amount} {o.fee.currency}{' '}
            <span className="dreq">{o.fee.bps / 100}%</span></dd></div>
      )}
      {/* The receipt itself, wherever this table appears while the order is
          still open. The verify step used to ask "check it landed before
          releasing" and then show everything except the thing being checked —
          the person holding the money had to decide on a file they could not
          open. The settled view leaves this out because the evidence pack below
          already carries it with its verification timestamp.

          `live` is for the escalated window: the order is terminal in the
          database but the release button is still on the card, so this hid the
          file from the one person still being asked to judge it — the exact
          failure this row was added to fix, reached by a different route. */}
      {o.otc?.receipt_url && (!o.terminal || live) && (
        <div><dt>Receipt</dt>
          <dd>
            {/* Every page, not the newest one.

                A payment is often more than one file — the transfer screen,
                the bank's confirmation, a statement line when neither carries
                the reference. The upload has taken the whole set for a while
                and the backend has sent it as `receipts` for just as long,
                with a note saying the single `receipt_url` beside it is "not
                enough for the side that has to check the payment". This is
                the client that was still reading the single one: somebody
                submitted two screenshots and the other side was asked to
                release on the strength of the second. */}
            {(o.otc.receipts?.length ?? 0) > 1 ? (
              <>
                {o.otc.receipts!.map((r, i) => (
                  <a className="lnk" key={r.ref} href={r.url} target="_blank" rel="noopener"
                    style={i ? { marginLeft: 10 } : undefined}
                    onClick={e => e.stopPropagation()}>
                    Page {i + 1}{r.verified ? ' ✓' : ''} ↗
                  </a>
                ))}
                <span className="dreq" style={{ marginLeft: 8 }}>
                  {o.otc.receipts!.length} pages · uploaded by the paying side
                </span>
              </>
            ) : (
              <>
                <a className="lnk" href={o.otc.receipts?.[0]?.url ?? o.otc.receipt_url}
                  target="_blank" rel="noopener"
                  onClick={e => e.stopPropagation()}>Open original ↗</a>
                <span className="dreq" style={{ marginLeft: 8 }}>
                  uploaded by the paying side
                </span>
              </>
            )}
          </dd></div>
      )}
      {doc && (
        <DocView doc={doc} has={!!p?.docs?.[doc]} peer={name} onClose={() => setDoc('')} />
      )}
      {/* The counterparty's score, a snapshot fixed at the moment of ordering.

          The **same number** as the ring on Discover -- they used to be two functions each computing their own, so
          the same card carried 74 and 56 side by side with neither explaining the other. They now share a source.

          A snapshot rather than a live computation: recomputed, a historical order's score would move with that
          merchant's later settlements and disputes, when this number says "how we saw them at the moment of ordering". */}
      {/* The copy matches the ring on Discover verbatim: the same number under two different names makes people
          think they are two things -- which is exactly how they were treated before. */}
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
 * Waiting and terminal states. The user is idle at these steps, which is precisely when they most want to go back
 * and check the counterparty -- so the details are laid out as usual, only with no action buttons.
 */
/*
What actually happens when the countdown reaches zero.

This was one sentence for every stop: "the coins return, recorded as a
default". It was true at s3 and nowhere else. At match and s1 nothing has
moved and nothing is recorded, and at s3v nothing is returned at all any more
— the coins freeze and a reviewer picks it up. A tooltip on a running clock is
read by the person deciding whether they have time to step away, so it is the
last place to be approximately right.
*/
const deadlineHint: Record<string, string> = {
  match: 'Let this lapse and the match closes. Nothing has moved — recorded as unfilled, not as a default.',
  s1: 'Let this lapse and the order closes before escrow is in place. No coins move, no default recorded.',
  s3: 'Miss this window and the coins return to them — recorded as a default.',
  s3v: 'Miss this window and the coins freeze for review. Nothing is returned to either side, '
    + 'and you can still confirm the receipt afterwards.',
}

function Waiting({
  o, sell, step, coin, fiat, ccy, canCancel, onCancel, onDispute, pending,
}: {
  o: Order; sell: boolean; step: string; coin: string; fiat: string; ccy: string
  canCancel?: boolean
  onCancel: () => void
  onDispute: () => void
  pending: boolean
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
    s5: [`${fiat} received`, settledLine(o, 'Escrow released to them · performance written back to both records')],
    expired: ['Their payment window missed', `Your ${coin} came back from escrow · their miss recorded`],
    cancelled: ['Order cancelled', `Your ${coin} came back from escrow · no default recorded`],
    disputed: ['In dispute — under review',
      `Your ${coin} stays locked in the contract until this is settled`],
    escalated: ['Verification overdue — under review',
      `Your ${coin} stays locked · confirm the receipt and it releases without a ruling`],
  } : {
    match: [`Waiting on ${o.counterparty_name ?? 'them'} to confirm`,
      'Nothing moves until they do · if they do not confirm, the match lapses'],
    s1: ['Verifying their escrow', 'Locked when they listed — binding it to this order'],
    s3: [`Waiting on ${o.counterparty_name ?? 'them'}`, 'They are sending the transfer'],
    s3v: ['Waiting on their check', 'They confirm the money landed, then escrow releases'],
    s4: ['Verifying your receipt', 'Amount, reference and sender name are checked against the escrow'],
    s5: [`${coin} credited`, settledLine(o, 'Settled in full · performance written back to their score')],
    expired: ['Payment window missed', `Their ${coin} was returned and the miss recorded against your score`],
    cancelled: ['Order cancelled', `Their ${coin} was returned · no default recorded`],
    disputed: ['In dispute — under review',
      `The ${coin} stays locked in the contract until this is settled`],
    escalated: ['They did not check in time — under review',
      `The ${coin} stays locked · nothing was returned to them`],
  }
  const mech: Record<string, string> = {
    match: 'The side that took the listing confirms — you committed when the listing '
      + 'locked your coins. A lapsed match is recorded as unfilled, not as a default.',
    s1: sell
      ? 'Your coins sit in the escrow contract — not with Atara, not with them. They release only when the buyer’s payment clears verification.'
      : 'Locked at listing, bound to your order now. If the binding fails, the trade closes — no exposure to you.',
    s3: 'Your coins stay locked while they pay. If the window lapses, escrow returns them automatically.',
    /* This used to promise that neither side could hold the funds back, while
       the window closing returned them to the side that had not looked at the
       receipt — so the one person who could hold them back was the only one
       the sentence was addressed to. Nothing is returned here now. */
    s3v: 'Once the receipt is confirmed, escrow releases. If the window closes with nobody '
      + 'confirming, the coins freeze and a reviewer takes it — they are not returned to either side.',
    escalated: 'Nothing was returned and nobody was paid. The coins stay in the contract until '
      + 'the receipt is confirmed or a reviewer decides.',
    s4: 'Release is automatic once the receipt matches. Neither side can hold the funds back.',
    s5: wasRuled(o.evidence?.arbitration)
      ? 'This one was settled by review rather than by the receipt clearing. The evidence pack '
        + 'carries the ruling: who raised it, what was decided, and who was found responsible.'
      : 'The evidence pack is the settlement record — receipt, escrow release and both signatures.',
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
      {/* `live` on an escalation, so the payer can still open what they sent.

          The receipt row hides itself once an order is terminal, on the
          reasoning that the evidence pack below carries the file from then
          on. An escalated order is terminal in the database while nothing has
          settled — and the pack only exists for terminal orders, so before
          the escalation there was no pack and after it there was no row. The
          person who is out the money had no way to see their own receipt at
          the one moment they might be asked about it. */}
      <Peer o={o} ccy={ccy} live={step === 'escalated'} />
      {/* The deposit watch window: what is being waited on is the evidence that the money really entered the
          contract, so show them the on-chain process rather than a bare countdown */}
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
            /* Buy direction: the coins entered the contract the moment the counterparty listed, so this only checks the lock and binds the order */
            <div className="fwait"><i />Checking the listing lock…</div>
          )}
        </div>
      )}
      {o.evidence && <Pack ev={o.evidence} coin={coin} fiat={fiat} ref_={o.ref} />}
      <p className="dmech">{mech[step] ?? ''}</p>
      {/* S1 cancel is the taker's. The listing maker used to get the same
          link and a 403 — this order belongs to another account. */}
      {step === 's1' && canCancel && (
        <div className="dfoot">
          <a href="#" className="lnk ecancel" onClick={e => { e.preventDefault(); if (!pending) onCancel() }}>
            Cancel order
          </a>
        </div>
      )}
      {/* The side that already paid, waiting on the other to look at the
          receipt. This screen had no control at all: the backend has always
          accepted a dispute from either party at s3v, but the only link that
          opened one lived in the upload pane, which this person left the
          moment they submitted. So the one with money out the door and the
          most reason to speak up was the one with nothing to press. */}
      {step === 's3v' && o.phase === 'lock' && (
        <div className="dfoot">
          <a href="#" className="lnk dspx" style={{ marginRight: 'auto' }}
            onClick={e => { e.preventDefault(); if (!pending) onDispute() }}>
            Report a problem
          </a>
        </div>
      )}
    </>
  )
}

/**
 * The evidence bundle -- what this order was finally closed out on.
 *
 * In the reference, the "Evidence ›" on the s5 row opens this very card (the link is inside .row1, and the click
 * bubbles up to expand the card), so it is not another card but the same card's terminal state. One ticket endpoint
 * is enough, as the user worked out for themselves: the two screenshots had the same content, only different states.
 *
 * Three things, and whichever is missing is simply not shown -- the point of an evidence bundle is "these really
 * happened", and padding a row turns it into decoration:
 *   Bank receipt   the file the payer submitted, opening to the original
 *   On-chain trail lock / bind / release, each with a hash, verifiable on an explorer
 *   Settlement time the moment verification passed
 */
const KIND: Record<string, string> = {
  lock: 'Coins locked in escrow',
  bind: 'Escrow bound to this order',
  release: 'Escrow released',
  refund: 'Escrow returned',
  deposit: 'Deposit received',
}

/*
Was this order actually ruled on by a person?

Not the same question as "did it ever reach `disputed`", which is what the
arbitration object answers. An escalated window lands there with nobody having
said anything, and the receiving side can then clear the receipt and settle it
themselves — no reviewer ever opens it. Three separate places asked the easy
question and told the settled order it had been decided by a review that never
happened, one of them pointing at a ruling the evidence pack does not contain.
*/
type Arbitration = NonNullable<NonNullable<Order['evidence']>['arbitration']>

// A type guard, so the callers that go on to read the ruling get it narrowed
// rather than re-checking the same fields with a non-null assertion.
function wasRuled(arb?: Arbitration): arb is Arbitration {
  return !!(arb && (arb.decided_at || arb.decision))
}

/*
The subtitle under a settled order, corrected for orders that were arbitrated.

"performance written back to both records" is what an ordinary settlement does,
and on a contested one it is wrong twice over. It skips the part both people
care about — a person read the case and decided it — and where the reviewer
found the seller responsible no completion was credited at all, so the sentence
states the opposite of what happened to their record.
*/
function settledLine(o: Order, normal: string): string {
  const arb = o.evidence?.arbitration
  if (!wasRuled(arb)) return normal
  if (arb.fault === 'you') return 'Settled by review · you were found responsible, and it is on your record'
  if (arb.fault === 'them') return 'Settled by review · they were found responsible, and it is on their record'
  if (arb.fault === 'none') return 'Settled by review · neither side was found at fault, so no default was recorded'
  return 'Settled by review · no responsibility was recorded either way'
}

function Pack({ ev, coin, fiat, ref_ }: {
  ev: NonNullable<Order['evidence']>; coin: string; fiat: string; ref_: string
}) {
  const done = ev.outcome === 'completed'
  const rows = ev.chain ?? []
  const arb = ev.arbitration
  if (!ev.receipt_ref && !rows.length && !arb) return null

  /* Everything that happened, in the order it happened.

     The time column on the right is what this block is for: read it down and
     you have the sequence. Rendering the ruling as its own group above the
     chain rows broke exactly that — a dispute raised at 15:10:58 sat above an
     escrow binding from 15:10:18 and the column ran backwards. So rows carry
     their own timestamp and get sorted, instead of being grouped by what kind
     of thing they are.

     Sorted on parsed milliseconds, not on the strings: RFC3339 with fractional
     seconds does not compare lexicographically against RFC3339 without them
     ('.' sorts before 'Z'), which would put 30.5s ahead of 30s.

     A row whose timestamp did not survive (malformed legacy data — see
     whenOrNil on the backend) sorts to the top rather than disappearing. Losing
     the fact is worse than showing it out of place. */
  const timed: { t: number; el: React.ReactElement }[] = []
  const at = (v?: string) => (v ? new Date(v).getTime() : 0)

  if (arb) {
    timed.push({
      t: at(arb.raised_at),
      el: (
        <div className="evrow evarb" key="arb-raised">
          <i className="warn" />
          {/* 'system' is a window that closed, not an accusation. It used to
              fall through to "They raised a dispute", so the person who had
              already paid was told the other side had complained about them —
              on an order where the other side had said nothing at all. */}
          <span>{arb.raised_by === 'system'
            ? 'Verification window closed · sent for review'
            : arb.raised_by === 'you' ? 'You raised a dispute'
              : arb.raised_by === 'them' ? 'They raised a dispute'
                /* Unknown, which now means only legacy rows. Naming a side we
                   cannot establish is how the escalation came to be reported
                   to the payer as the other side complaining about them. */
                : 'A dispute was raised'}
            {/* The claim is printed as it was chosen. DisputeForm's options are
                already sentences, so a translation table here would only be one
                more thing to drift out of step with that list. */}
            {arb.claim ? ` · ${arb.claim}` : ''}</span>
          {arb.raised_at && <time>{new Date(arb.raised_at).toLocaleString()}</time>}
        </div>
      ),
    })
  }
  /* Only once a reviewer has actually ruled.

     This row used to be pushed whenever there was a dispute at all, so an
     order still waiting for review announced "Reviewed by Atara · escrow
     released to the buyer" — a decision nobody had made, about coins that had
     not moved, sorted to the top of the timeline because an absent timestamp
     reads as 0. Escalations made it common; it was always wrong. */
  if (wasRuled(arb)) {
    timed.push({
      t: at(arb.decided_at),
      el: (
        <div className="evrow evarb" key="arb-ruled">
          <i className="ok" />
          <span>{arb.decision === 'refund'
            ? 'Reviewed by Atara · escrow returned to the seller'
            : 'Reviewed by Atara · escrow released to the buyer'}
            {/* Naming the responsible side is the point of asking the reviewer
                for it. Left unsaid, whoever is carrying the default finds out
                from their score. */}
            {arb.fault === 'you' && ' · you were found responsible'}
            {arb.fault === 'them' && ' · they were found responsible'}
            {arb.fault === 'none' && ' · neither side at fault'}</span>
          {arb.decided_at && <time>{new Date(arb.decided_at).toLocaleString()}</time>}
        </div>
      ),
    })
  }
  rows.forEach((c, i) => timed.push({
    t: at(c.at),
    el: (
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
    ),
  }))
  timed.sort((a, b) => a.t - b.t)

  return (
    <div className="eswin evpack">
      <div className="fal">
        <span>Evidence pack · {ref_}</span>
        <b>{done ? `${coin} → ${fiat}` : ev.outcome}</b>
      </div>
      {/* The bank receipt is pinned here rather than placed in the sequence
          below. Its timestamp is when it was verified, not when it landed, so
          it has no honest position in a timeline — see the note on the row. */}
      {ev.receipt_url && (
        <div className="evrow">
          <i className="ok" />
          {/* One page is just "Bank receipt"; several have to say how many -- this bundle is the settlement record,
              and a page left unprinted is a page missing from the record. */}
          <span>{(ev.receipts?.length ?? 0) > 1
            ? `Bank receipt · ${ev.receipts!.length} pages`
            : 'Bank receipt'}</span>
          {(ev.receipts?.length ?? 0) > 1 && ev.receipts!.slice(0, -1).map((r, i) => (
            <a href={r.url} target="_blank" rel="noopener" key={r.ref}
              style={{ marginRight: 8 }}
              onClick={e => e.stopPropagation()}>Page {i + 1} ↗</a>
          ))}
          {/* What opens is the original as submitted, not the words "uploaded" */}
          <a href={ev.receipts?.at(-1)?.url ?? ev.receipt_url}
            target="_blank" rel="noopener"
            /* The link text does not print file_ref: that is a uuid and means nothing to a person, and the left of
               this row has already said what it is. */
            onClick={e => e.stopPropagation()}>
            {(ev.receipts?.length ?? 0) > 1 ? `Page ${ev.receipts!.length} ↗` : 'Open original ↗'}
          </a>
          {/* settled_at is the moment receipt verification passed, not the moment of release -- release comes after
              it. A separate "Settled" row would sort below release while carrying an earlier time, and reading down
              the column would look like time running backwards. It belongs to this receipt, so it follows the receipt. */}
          {ev.settled_at && <time>verified {new Date(ev.settled_at).toLocaleString()}</time>}
        </div>
      )}
      {timed.map(r => r.el)}
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
