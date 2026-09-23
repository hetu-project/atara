import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import { useAssessment } from '../hooks/useAssessment'
import { ApiError } from '../api/client'
import { scoreBand } from '../api/types'
import { useApi } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import { go } from '../hooks/useRoute'
import { useKycGate } from '../hooks/useKycGate'
import { useWalletTx } from '../hooks/useWalletTx'
import type { Offer } from '../api/types'
import { Failed, Pending } from '../components/Loading'
import ConfirmSheet from '../components/ConfirmSheet'

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const flag = (c: string) => {
  const cc = c === 'EUR' ? 'EU' : c.slice(0, 2)
  return String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
const relText = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`

/** The six qualification documents. Missing ones are published too -- let buyers price the gap themselves rather than having the platform hide it for them. */
const DOCS: [string, string, string][] = [
  ['kyc', 'KYC', 'Identity verified by the platform'],
  ['pof', 'PoF', 'Proof of funds — will share on request'],
  ['stm', 'Stmts', 'Bank statements — will share on request'],
  ['poa', 'PoA', 'Corporate authorization / power of attorney'],
  ['sow', 'SoW', 'Source of wealth — verified for large sizes'],
  ['chain', 'Chain', 'On-chain address provenance screened'],
]

/**
 * Discover - the trading pool.
 *
 * "Buy" looks at other people's sell listings and "Sell" at their buy listings -- the direction has to be
 * inverted when matching. Nothing on the card is decorative: the trust score is the first judgement in
 * choosing who to trade with, the settlement history is where that score comes from (a score without its
 * basis is not enough), and the minimum lot decides whether this listing is relevant to me at all.
 */
export default function Pool({ identity, onNeedSignIn }: { identity: string; onNeedSignIn?: () => void }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [coin, setCoin] = useState('All')
  const [fiat, setFiat] = useState('')
  /* Fiat filtering goes through a dialog. It used to cycle to the next currency on each click -- with more
     currencies that means seven or eight clicks to reach one, with no idea along the way what else is coming. */
  const [picking, setPicking] = useState(false)

  /* 15s, like every other list that changes on its own. This one was the
     exception: whoever opened Discover saw the pool as it stood at that moment,
     and kept seeing it — listings posted since never appeared, listings taken
     since stayed clickable until the backend refused the order. The live
     stream cannot cover it: the offer event goes only to the listing's owner.
     It still helps for that owner, whose external-deposit listing goes up
     minutes after they closed the sheet. */
  const { data, error, reload } = useApi(() => ep.offers(side), [side], 15000)
  useEffect(() => {
    addEventListener(LIVE_CHANGED, reload)
    return () => removeEventListener(LIVE_CHANGED, reload)
  }, [reload])
  const { data: assets } = useApi(() => ep.assets(), [])
  const { data: fiatGroups } = useApi(() => ep.fiats(), [])
  const { data: mine } = useApi(() => ep.myOffers(identity), [identity])
  const mineIds = new Set((mine ?? []).map(o => o.id))

  const all = data ?? []
  /* Filter options come from the catalog, not inferred from the current listings -- the filter bar should not
     disappear when the pool is empty, which would suggest "this currency is gone" rather than "nobody is
     listing in this direction right now". */
  const coins = ['All', ...(assets ?? []).map(a => a.code)]
  const list = all
    .filter(o => coin === 'All' || o.asset === coin)
    .filter(o => !fiat || o.fiat === fiat)
    /* Your own listing first — you need to see it the moment you post it.
       The rest by score, with unrated makers last: that is an ordering
       preference, not a verdict. Ranking them as if they scored zero would
       bury a new maker under everyone who has ever traded, and a maker who
       never gets a first trade never gets a record either. */
    .sort((a, b) => (mineIds.has(b.id) ? 1 : 0) - (mineIds.has(a.id) ? 1 : 0)
      || (b.maker.trust_score ?? -1) - (a.maker.trust_score ?? -1))

  return (
    <div className="view on" id="v-market">
      <div className="vhead"><h2>Discover</h2></div>
      <div className="vbody" id="mkbody">
        {/* This version has only one vertical, OTC. A tab row with one option is not navigation, it is noise --
            so this row keeps only the maker entry point. Bring the tabs back when a vertical is added. */}
        <div className="mkbar" style={{ justifyContent: 'flex-end' }}>
          <MakerCta />
        </div>
        <div className="mkbar">
          {/* Direction comes first, because buyers and sellers are looking at two completely different sets of listings */}
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
          <button className="mkfiat" onClick={() => setPicking(true)}>
            {fiat ? `${flag(fiat)} ${fiat}` : 'Any currency'}
          </button>
        </div>

        {picking && (
          <FiatPicker groups={fiatGroups ?? []} on={fiat}
            /* Only list currencies someone in the pool will actually take: list one nobody is listing in and the
               result is an empty pool, which reads as a broken filter. */
            avail={new Set(all.map(o => o.fiat))}
            onPick={c => { setFiat(c); setPicking(false) }}
            onClose={() => setPicking(false)} />
        )}

        <div id="pool">
          {list.map(o => <OfferCard key={o.id} o={o} side={side} mine={mineIds.has(o.id)}
            identity={identity} onNeedSignIn={onNeedSignIn} />)}
          {!list.length && (data === null
            ? <div className="mkempty">
                {error ? <Failed error={error} onRetry={reload} /> : <Pending rows={3} />}
              </div>
            : <div className="mkempty">No offers match</div>)}
        </div>
      </div>
    </div>
  )
}

/**
 * Maker onboarding entry point. The button copy follows the application state --
 * writing "Become a maker" while it is under review makes people think the submission failed and submit again.
 */
function MakerCta() {
  /* Use the door's copy rather than fetching again: approval is a backend state change a few seconds later, and
     only the door's copy is polling. A separately fetched copy has nobody asking about it, so after approval the
     button would sit on "Under review..." indefinitely. */
  const { app, ...kyc } = useKycGate()
  /* The rejected case, where the ball is in the user's court. This cell used to fall into "under review" -- after
     a rejection the `*_done` flags are not cleared, so without recognising it separately, things waiting on them
     to fix show up as "we are still reviewing", which is exactly the kind of misleading this change set out to remove. */
  const revise = !!app?.reject_reason && !app?.approved
  const label = app?.approved ? 'Post a listing →'
    : revise ? 'Changes requested →'
      : (app?.listing_done || (app?.kyc_done && !app.kyc_ok)) ? 'Under review…'
        : 'Become a maker →'
  const busy = label === 'Under review…'
  return (
    <button className="lnk" style={{ opacity: busy ? 0.6 : 1 }}
      onClick={() => kyc.openMaker(app?.approved ? 'offer' : undefined)}>{label}</button>
  )
}

function OfferCard({
  o, side, mine, identity, onNeedSignIn,
}: {
  o: Offer; side: 'buy' | 'sell'; mine: boolean; identity: string
  onNeedSignIn?: () => void
}) {
  const m = o.maker
  const { start } = useAssessment()
  const kyc = useKycGate()
  const sym = FIAT_SYM[o.fiat] ?? ''
  const px = Number(o.unit_price)
  const qty = Number(o.remaining_qty)
  const ceiling = Math.round(Number(o.fiat_ceiling))
  const docsOn = Object.values(m.docs ?? {}).filter(Boolean).length
  /* Whether there is settlement history to show on the trust line.
     Not a gate on the score ring any more — that one always draws, see below.
     With no trades there is nothing to put in "N trades · X% completion", so
     the line says so instead of printing zeroes. */
  const scored = m.deals > 0
  /* null means no settlement record at all — a different state from a low
     score, and rendered as one. */
  const rated = m.trust_score

  /* Unlisting sends a transaction on the chain the listing lives on — not the
     one the backend happens to be connected to — so it needs the chain's
     deployment and this account's address.

     Only on your own cards. These used to be fetched by every card on the page:
     a screen of six listings opened with six identical /catalog/chain and six
     identical /wallet, and five of each pair were for the unlist button that
     card will never show. Deciding here rather than lifting the fetch to the
     page keeps the data next to the one branch that reads it. */
  const { data: chains } = useApi(
    () => (mine ? ep.chainInfo() : Promise.resolve(null)), [mine])
  const { data: myWallet } = useApi(
    () => (mine ? ep.wallet(identity) : Promise.resolve(null)), [mine, identity])
  const { toast } = useToast()
  const tx = useWalletTx(
    (chains?.chains ?? []).find(c => c.code === o.network) ?? null, myWallet?.address)
  /* Unlisting asks first. It used to fire on the card click: one tap on a
     button that reads like every other card's Buy, and the wallet prompt was
     already up — the first thing the person saw was a signature request for
     something they had not decided to do. The sheet says what will happen and
     takes the decision; the wallet, if the coins were locked from it, asks for
     the signature after. */
  const [askUnlist, setAskUnlist] = useState(false)
  const [unlisting, setUnlisting] = useState(false)
  /* Taking asks too, with the amount editable. One tap on the card used to
     place a take for the whole remaining quantity -- no number typed, no
     confirmation -- and reserve the maker's entire listing by accident. */
  const [askTake, setAskTake] = useState(false)
  const [amt, setAmt] = useState('')
  const [taking, setTaking] = useState(false)

  const unlist = async () => {
    setUnlisting(true)
    /* Delisting returns the coins to the wallet, and the contract only recognises the address that locked them --
       so a backend-initiated call necessarily reverts. Hence the backend first says "your turn to sign"
       (UNLOCK_REQUIRED), and after signing it comes back once more, that time only verifying "it really was
       unlocked on chain". */
    try {
      await ep.delistOffer(o.id, identity)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNLOCK_REQUIRED') {
        /* The coins were locked by the maker's own wallet, so only that
           wallet can release them. Ask for the signature, then come back —
           the second call records it and settles any takes on the listing. */
        let unlocked = false
        try {
          const prep = await ep.prepareDelist(o.id, identity)
          await tx.unlockListing({ escrow: prep.escrow, offerKey: prep.offer_key })
          unlocked = true
          await ep.delistOffer(o.id, identity)
        } catch (e2) {
          if (unlocked) {
            /* The chain has the coins back; only our own bookkeeping call
               failed. Saying "could not unlock" here would be false, and the
               listing is not stuck: the backend re-reads the chain every
               thirty seconds and takes it down on its own. */
            toast('Coins unlocked · the listing comes down within a minute', { kind: 'info' })
            location.reload()
            return
          }
          toast(msgOf(e2, 'Could not unlock those coins'), { kind: 'err' })
          setUnlisting(false)
          return
        }
      } else {
        /* This used to `return` in silence. Unlisting is the only way to get
           locked coins back, so a button that fails without a word leaves
           someone believing their money is stuck with no way to ask why. */
        toast(msgOf(e, 'Could not unlist that offer'), { kind: 'err' })
        setUnlisting(false)
        return
      }
    }
    location.reload()
  }

  /* The card tap: gates first, then the sheet. Placing happens in `take`. */
  const open = () => {
    /* Ask for identity before switching views: otherwise the user is dropped onto an empty page and the sign-in door catches up afterwards */
    if (onNeedSignIn) { onNeedSignIn(); return }
    /* Then the identity door. The fiat leg goes peer to peer through banks, so the payer has to be identifiable -- buyers verify too. */
    if (!mine && kyc.require()) return
    if (mine) { setAskUnlist(true); return }
    /* Empty, with what is available in the placeholder — the shape the
       original sheet used. Prefilling put the raw remaining quantity in the
       box (`106647.010944`, six decimals of float noise) next to a hint that
       printed the same number formatted, so the two disagreed on screen. An
       empty field also asks the question the sheet exists to ask: how much,
       rather than "confirm taking all of it". */
    setAmt('')
    setAskTake(true)
  }

  /* What the sheet's amount field allows: above zero, within what is left,
     and worth at least the maker's smallest lot in fiat. */
  const amtNum = Number(amt)
  const amtFiat = amtNum * px
  const amtBad = !(amtNum > 0) ? 'Enter an amount above zero'
    : amtNum > qty ? `Only ${qty.toLocaleString()} ${o.asset} is available`
      : amtFiat < Number(o.min_lot) ? `${m.name}'s smallest lot is ${sym}${Number(o.min_lot).toLocaleString()}`
        : ''

  const take = async (amount: string) => {
    setTaking(true)
    /* Clicking an order in the hall lands in **that person's conversation**, not on a standalone ticket page.

       The reference's showOrder() works exactly this way: ensureThread(o.peer) -> restoreSession -> the
       assessment runs in the open inside the conversation -> the ticket card is appended to the same stream.
       This used to navigate to view:'order', which split the assessment, the settlement and every subsequent
       word into three places that could not see each other -- when "what I did with this person" is one thing.
       The conversation is the only complete record of it.

       The counterparty's id is only known once the ticket comes back (Offer.maker carries no user id), so the
       order is placed first and the conversation entered second, rather than entering a conversation and
       waiting for it to grow one. */
    try {
      /* Order by coin quantity: the fiat amount is a conversion, and a whole-listing order would exceed the
         available volume by a few cents through rounding and then be rejected by the backend. */
      const ord = await ep.take(o.id, {
        amount, amount_kind: 'coin', network: o.networks[0] ?? o.network,
      })
      setAskTake(false)
      /* Place the order first, then start, and replay **the copy stored against this order**.

         The other way round (assessing against the listing first, then ordering) produces two sets of scores:
         the backend scores from a seed, and the listing id and the ticket id are two different seeds. And after
         ordering both are on screen at once -- the right column is running while the card is already in the
         conversation stream -- so one order showing two sets of numbers can only read as made up.

         Not awaited: votes landing one by one is a process for people to watch, and entering the conversation should not wait for it. */
      void start(o.id, m.name, ord.id)
      go({ view: 'thread', peer: ord.counterparty_id ?? '' })
    } catch (e) {
      /* Stay on the card. The thread does not exist yet, so there is nowhere
         else for the error to appear — swallowing it made a failed click
         look like a dead button. */
      toast(msgOf(e, 'Could not open that order'), { kind: 'err' })
    } finally { setTaking(false) }
  }

  return (
    <>
    {/* Outside the card's <button>: a dialog nested in a button is invalid
        markup, and every click inside it would bubble up as a card click. */}
    {askUnlist && (
      <ConfirmSheet
        title="Unlist"
        amount={qty.toLocaleString()} unit={o.asset}
        walletKind={myWallet?.wallet_kind ?? 'atara'}
        busy={unlisting}
        lead={<>
          Take <b className="num">{qty.toLocaleString()} {o.asset}</b> off the market at{' '}
          <b className="num">{sym}{px.toLocaleString()}</b>. The coins return to your
          wallet; trades already in progress on this listing are not affected.
        </>}
        note={{ why: 'Unlisting releases the escrow',
                how: 'If your wallet locked the coins, it will ask you to sign the release next.' }}
        /* A plain button: the sheet is the decision, the wallet is the
           signature, and only some listings need one. "Sign in your wallet"
           here would promise a prompt that the external-deposit route never
           shows. */
        plain="Unlist"
        onConfirm={() => void unlist()}
        onClose={() => { if (!unlisting) setAskUnlist(false) }} />
    )}
    {askTake && (
      <ConfirmSheet
        title={o.side === 'sell' ? 'Buy' : 'Sell'}
        /* The symbol is the unit, sitting in front, and the figure is
           separated. Baking `¥` into the string put it in the figure's own
           weight and size, and `unit` then appended the currency code on top
           of it: `¥779589.65CNY`, unseparated, with the code jammed against
           the last digit because the unit's margin is on its right — where a
           prefix needs it. */
        amount={amtBad ? undefined
          : amtFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        unit={sym} unitPos="pre"
        walletKind={myWallet?.wallet_kind ?? 'atara'}
        busy={taking}
        blocked={!!amtBad}
        lead={<>
          {o.side === 'sell' ? 'Buy' : 'Sell'} <b className="num">{o.asset}</b> with{' '}
          <b>{m.name}</b> at <b className="num">{sym}{px.toLocaleString()}</b> per unit.
          Taking reserves that much of their listing for you until you confirm.
        </>}
        extra={
          <label className="sf">
            <span className="sfl">Amount ({o.asset})</span>
            {/* type is spelled out because the stylesheet keys off it. HTML
                defaults a missing type to text; CSS attribute selectors do
                not — they match what is written, so `.sf input[type=text]`
                skipped this one entirely and it fell back to the browser's
                own white box in the middle of a dark sheet. */}
            <input className="num" type="text" inputMode="decimal" value={amt} autoFocus
              onChange={e => setAmt(e.target.value.trim())}
              placeholder={`up to ${qty.toLocaleString()}`} />
            {/* An empty field is not a mistake, it is the question. Showing
                "Enter an amount above zero" the instant the sheet opens tells
                somebody off for not having typed yet; the button is already
                disabled, which is the honest way to say the same thing. The
                original hid this line entirely until a submit failed. */}
            <small className={amt && amtBad ? 'bad' : ''}>
              {(amt && amtBad)
                || `${qty.toLocaleString()} ${o.asset} available · smallest lot ${sym}${Number(o.min_lot).toLocaleString()}`}
            </small>
          </label>
        }
        /* Taking is a commitment, not a signature: nothing moves until the
           taker confirms on the next step. */
        plain={o.side === 'sell' ? 'Take · buy' : 'Take · sell'}
        onConfirm={() => { if (!amtBad) void take(amt) }}
        onClose={() => { if (!taking) setAskTake(false) }} />
    )}
    <button className={'od' + (mine ? ' odmine' : '')} onClick={open}>
      <div className="od-h">
        <span className="od-peer">{m.name}
          <i className="od-id num">{m.peer_code}</i>
          {mine ? <i className="od-known">Your listing · {o.side === 'sell' ? 'selling' : 'buying'}</i> : null}
        </span>
        {/*
          Every card carries the ring, the way console.html renders it — the
          score is the first thing anyone judges a counterparty by, and a card
          missing that corner reads as a different kind of card rather than as
          "no score yet".

          Unrated is its own state, not a low one. A merchant with no settled
          trades has nothing to summarise: the ring draws empty, with no number
          inside. A dash in that hole reads as a missing widget; an empty ring
          still occupies the same corner as a scored card. Painting a 0 there
          would put someone we know nothing about in the warning band, which
          keeps a new maker from ever getting a first trade — and without a
          first trade there is never a record. See the trust-score design note §4.
        */}
        <span className={('od-ai ' + scoreBand(rated)).trimEnd()}
          style={{ ['--p' as string]: rated ?? 0 }}
          title={rated === null
            ? 'Not rated yet — no settled trades to score'
            : 'AI risk score — priced from settlement history, fund provenance and dispute record'}>
          <span className="od-ring">
            <svg viewBox="0 0 44 44" aria-hidden>
              <circle className="trk" cx="22" cy="22" r="18" />
              <circle className="val" cx="22" cy="22" r="18" />
            </svg>
            {rated !== null ? <b className="num">{rated}</b> : null}
          </span>
          <em>{rated === null ? 'Not rated' : 'AI score'}</em>
        </span>
      </div>

      {/* Where the score comes from; a score without its basis is not enough */}
      <div className="od-trust">
        {!scored ? <span>New merchant — history builds as trades settle</span> : (
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
    </>
  )
}


/**
 * Settlement currency picker. The structure mirrors the reference's openFiatPicker point for point:
 * search box + Any currency + currency cards grouped by corridor.
 */
function FiatPicker({
  groups, on, avail, onPick, onClose,
}: {
  groups: { group: string; assets: { code: string; name: string }[] }[]
  on: string
  avail: Set<string>
  onPick: (code: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const kw = q.trim().toLowerCase()
  const shown = groups
    .map(g => ({
      group: g.group,
      assets: g.assets.filter(a => avail.has(a.code)
        && (!kw || a.code.toLowerCase().includes(kw) || a.name.toLowerCase().includes(kw))),
    }))
    .filter(g => g.assets.length)

  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>Settlement currency</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <div className="sf">
            <input type="text" autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search currency or code" autoComplete="off" />
          </div>
          <button className={'fany' + (on ? '' : ' on')} onClick={() => onPick('')}>Any currency</button>
          {shown.map(g => (
            <div className="fgrp" key={g.group}>
              <h4>{g.group}</h4>
              <div className="fgrid">
                {g.assets.map(a => (
                  <button key={a.code} className={'fchip' + (on === a.code ? ' on' : '')}
                    onClick={() => onPick(a.code)}>
                    <span className="fflag">{flag(a.code)}</span>
                    <span className="fmeta"><b>{a.code}</b><em>{a.name}</em></span>
                    {on === a.code ? <span className="fok">✓</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!shown.length && <div className="fempty">No match</div>}
        </div>
      </div>
    </div>
  )
}

/** Error → something worth showing. Keeps the server's wording when it has one. */
function msgOf(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}
