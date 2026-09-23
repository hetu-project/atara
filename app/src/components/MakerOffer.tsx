import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { LIVE_CHANGED } from '../api/events'
import { useToast } from './Toast'
import ConfirmSheet from './ConfirmSheet'
import CopyButton from './CopyButton'
import Qr from './Qr'
import { IInfo } from './icons'
import { assertPasskey } from './SessionLock'
import { isWalletTxError, useWalletTx } from '../hooks/useWalletTx'
import { FX_IDX } from './kycforms'
import type { Listing } from './MakerListing'
import { ApiError } from '../api/client'
import type { DepositStatus, Offer, PreparedOffer, StrandedLock as ApiStrandedLock } from '../api/types'
import type { TxStep } from '../hooks/useWalletTx'

/**
 * One listing: an amount and a price.
 *
 * The same vehicle as identity verification and trading terms -- a card inside the Atara AI conversation. The
 * benefit is not only consistency: once posted, the card stays in the conversation as the record of that listing.
 *
 * The options are not hardcoded; they are what the trading terms bounded, intersected with the catalog. The
 * reference intersects too (`d.nets.filter(n => NETS_OF[coin].includes(n))`), only its catalog is a static array
 * while ours comes from the backend -- the backend only settles USDT / USDC, so BTC ticked in the terms cannot be
 * listed anyway, and it should not be put here for someone to click and then be rejected by the endpoint.
 */

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const num = (v: string) => Number(String(v).replace(/[,，\s]/g, ''))

/** The listing to be sent to the backend. The confirmation dialog holds it and sends it unchanged on confirm. */
type OfferBody = {
  side: 'sell' | 'buy'; asset: string; fiat: string
  unit_price: string; qty: string; min_lot: string
  network: string; networks: string[]
}

/*
Coins already locked into the contract for which no listing was ever created.

On a real chain a sell listing is three steps: request an id -> lock coins in the wallet -> create the listing. The
middle one is an on-chain transaction and cannot be recalled; the third can still fail (network dropped, response
lost, token just expired). On failure these two ids live only in send()'s local variables and vanish with that
click -- the coins are in the contract, the UI says only "Could not post", and clicking again requests a new id and
locks a second set, while the first stays there forever, out of reach even of delisting (which has to look up the
listing row by id first).

So the id is written down the moment the lock succeeds, into localStorage rather than state: this step's failure
modes include "closed the page". It is erased once the listing is created.

A failed write (private mode, site data disabled) must not break the listing flow -- it falls back to the original
behaviour, where state still remembers within this session and retrying still works.
*/
type StrandedLock = Recoverable & { at: number }

const lockKey = (uid: string) => `atara.locked-not-listed.${uid}`

function readStranded(uid: string): StrandedLock | null {
  if (!uid) return null
  try {
    const raw = localStorage.getItem(lockKey(uid))
    if (!raw) return null
    const v = JSON.parse(raw) as StrandedLock
    return v && v.offer_id && v.body ? v : null
  } catch { return null }
}
function writeStranded(uid: string, v: StrandedLock) {
  if (!uid) return
  try { localStorage.setItem(lockKey(uid), JSON.stringify(v)) } catch { /* see above */ }
}
function clearStranded(uid: string) {
  if (!uid) return
  try { localStorage.removeItem(lockKey(uid)) } catch { /* see above */ }
}

/* Whether this lock can be used to post this listing.

   What is compared is what the lock itself covers -- which token on which chain, and how much. Price and minimum
   lot are not part of it: they do not affect what was locked on chain, and posting with a changed price against the
   same lock is correct. */
const sameLock = (r: Recoverable, b: OfferBody) =>
  r.body.asset === b.asset && r.body.qty === b.qty && r.body.network === b.network

/*
A stranded lock that can be posted, one kind of thing assembled from two sources.

The server-side copy (/offers/stranded) is authoritative: it is computed from deposit rows plus the on-chain lock,
and is still findable on another device or after site data has been cleared -- precisely what the localStorage copy
cannot do.
The local copy wins on speed, and carries the hash of the locking transaction, which the server never stored.

So both are used, merged by id, with the local one on top (it carries one extra hash, which does no harm).
*/
type Recoverable = {
  offer_id: string
  lock_tx: string
  body: OfferBody
  /* delisted: this id has an **already delisted** listing under it while the coins are still locked in the
     contract -- an admin override (which cannot sign the unlock), or an older delisting that skipped the unlock when
     the remainder was zero. The way out for this kind is not "post it" (the id is taken by that listing and would
     hit OFFER_EXISTS) but "unlock": run the delisting flow again, and the wallet will be asked to sign the unlock transaction. */
  delisted?: boolean
  /** How much is still locked in the contract right now. Only the server copy knows; the delisted kind is displayed from it. */
  available?: string
}

const fromServer = (l: ApiStrandedLock): Recoverable => ({
  offer_id: l.offer_id,
  lock_tx: '', // The server never stored this; reposting does not need it, and it only feeds the on-chain trail
  body: {
    side: 'sell', asset: l.form.asset, fiat: l.form.fiat,
    unit_price: l.form.unit_price, qty: l.form.qty, min_lot: l.form.min_lot,
    network: l.form.network, networks: l.form.networks ?? [l.form.network],
  },
  delisted: l.delisted === true,
  available: l.available,
})

/* Merge both sides, with the local copy taking precedence. done holds the ones already posted within this session --
   the server list will not exclude them until the next fetch, and in the meantime they should not still be nagging on screen. */
function mergeRecoverable(
  local: Recoverable | null, server: ApiStrandedLock[] | null, done: string[],
): Recoverable[] {
  const by = new Map<string, Recoverable>()
  for (const l of server ?? []) by.set(l.offer_id, fromServer(l))
  if (local) by.set(local.offer_id, local)
  return [...by.values()].filter(r => !done.includes(r.offer_id))
}

/* Expiry as "when · how long is left".

   Both: the absolute time is what a withdrawal queue is checked against, the
   relative one is the answer wanted at a glance. Relative alone goes stale while
   the card sits open; absolute alone makes the reader do the subtraction.

   The day is part of "when". A bare "17:10" shown at 19:00 reads as today and
   is wrong by a day, so anything not today gets "Tomorrow" or a date. Minutes
   drop once an hour or more is left; the listing is not that precise, and
   "22h 9m" is two numbers where one does the job. */
function expiresText(unix?: number): string {
  if (!unix) return '—'
  const at = new Date(unix * 1000)
  const left = unix * 1000 - Date.now()
  if (left <= 0) return 'expired'
  const now = new Date()
  const next = new Date(now); next.setDate(now.getDate() + 1)
  const day = at.toDateString() === now.toDateString() ? ''
    : at.toDateString() === next.toDateString() ? 'Tomorrow '
    : at.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' '
  const clock = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const h = Math.floor(left / 3_600_000)
  /* Floor, not round: rounding turns 59m 40s into "60m". */
  const m = Math.floor((left % 3_600_000) / 60_000)
  return `${day}${clock} · ${h > 0 ? `${h}h` : `${m}m`} left`
}

/** 0x34Bd…E1D7 — enough to recognise an account, not enough to mistype it. */
const shortAddr = (a?: string) => (a ?? '').replace(/^(.{6}).+(.{4})$/, '$1…$2')

/* When the contract was last read. A clock next to "Check now" answers "is the
   poll still running" more honestly than a pulsing dot: the dot animates whether
   or not anything is happening. */
function checkedText(at: number): string {
  if (!at) return ''
  return `Checked ${new Date(at).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

/* What is said after clicking "I have transferred it", and in what tone.

   The tone follows the **meaning** rather than colouring everything red. "Not arrived" most of the time simply means
   the money has not been sent yet, or the transaction has not landed in a block -- painted red, people assume the
   operation failed when nothing has. What genuinely needs to stand out is "arrived but not enough": that one needs
   another action from them, and without saying so they will wait forever for something that will not happen.

   It states the on-chain fact of the moment, not something reassuring. The reason for a shortfall is usually very
   specific (they entered the listing amount, forgot the fee, the exchange deducted a withdrawal fee), and stating
   the difference tells them immediately how much to top up. */
/* alert: nothing has arrived and the person has to act — the one state in
   this list where waiting is not the right move, so it is the one in red. */
type Wait = { tone: 'idle' | 'alert' | 'warn' | 'ok'; text: string }

function waitLine(d: DepositStatus | null): Wait {
  if (!d) return { tone: 'idle', text: 'Checking the contract…' }
  if (d.status === 'swept') {
    /* Say them separately. Coins entering escrow is the on-chain step, and the listing going live is a step after
       it that has failed before -- announcing the latter on the strength of the former sends people to Listings to
       look for a listing that is not there, and they conclude the UI is broken. What has really gone wrong then is
       the backend, and this sentence would have covered it up. */
    return d.listed
      ? { tone: 'ok', text: 'The coins are in escrow and your listing is up.' }
      : { tone: 'warn', text: 'The coins are in escrow. Posting the listing is taking '
          + 'longer than usual — nothing is lost, the coins are locked under this listing.' }
  }
  if (d.status === 'expired') {
    return { tone: 'warn', text: 'The price expired before the coins arrived. '
      + 'Anything sent there is still yours to take back.' }
  }
  const got = Number(d.received)
  const need = Number(d.need)
  if (!got) return { tone: 'alert', text: 'Nothing has arrived yet. Watching the contract.' }
  if (got < need) {
    return { tone: 'warn',
      text: `Received ${d.received} of ${d.need} — send the rest and it will go up by itself.` }
  }
  return { tone: 'ok', text: 'The transfer landed. Posting the listing…' }
}

export default function MakerOffer({
  terms, identity, onPosted, onEditTerms,
}: {
  terms: Listing | undefined
  identity: string
  onPosted: (o: Offer, sym: string) => void
  /** Reopen the trading terms. Every choice on this form is bounded by them. */
  onEditTerms?: () => void
}) {
  /* Which fiat the terms settle in comes from the accounts they picked. */
  const { data: accts } = useApi(() => ep.bankAccounts(identity), [identity])
  const { data: cat } = useApi(() => ep.assets(), [])
  const { data: fiatCorridors } = useApi(() => ep.fiats(), [])
  const { data: w } = useApi(() => ep.wallet(identity), [identity])
  /* With a chain connected, go through a real transaction: the coins are locked into the escrow contract by the
     maker's own wallet.
     With no chain (mock) no chain is deployed, so take the original backend-bookkeeping path. */
  const { data: chains } = useApi(() => ep.chainInfo(), [])

  const [side, setSide] = useState('')
  const [coin, setCoin] = useState('')
  const [net, setNet] = useState('')
  const [fiat, setFiat] = useState('')
  const [px, setPx] = useState('')
  const [qty, setQty] = useState('')
  const [min, setMin] = useState('')
  /* Which row is wrong, plus why it is wrong this time. One row can be wrong in two ways (not filled / filled too
     high), and hanging a single fixed sentence on it means leaving it blank reports "cannot exceed the listing
     total" -- which is about something else, and people stare at that number editing it over and over. That is what
     the reference does, and on the first day it was copied over somebody was blocked by it. */
  const [bad, setBad] = useState<{ id: string; msg?: string }>({ id: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* The listing awaiting confirmation. Non-empty means the confirmation dialog is open -- it holds exactly the body
     to be sent, which is sent unchanged on confirm with no recomputation in between (recomputing means what was
     confirmed and what is sent may not be the same thing). */
  const [confirm, setConfirm] = useState<OfferBody | null>(null)

  /* The range bounded by the terms, intersected with the range the catalog sends. With terms never filled in, fall
     back to the whole catalog -- unreachable in practice, but an empty array would render the whole card blank, which is worse than one extra line. */
  const codes = (cat ?? []).map(a => a.code)
  const sides = terms?.dir.length ? terms.dir : ['Sell crypto', 'Buy crypto']
  const coins = (terms?.coins ?? codes).filter(c => codes.includes(c))
  const curSide = sides.includes(side) ? side : (sides[0] ?? 'Sell crypto')
  const curCoin = coins.includes(coin) ? coin : (coins[0] ?? '')
  const catNets = cat?.find(a => a.code === curCoin)?.networks ?? []
  const nets = (terms?.nets ?? catNets).filter(n => catNets.includes(n))
  const curNet = nets.includes(net) ? net : (nets[0] ?? '')
  /* The selected network is the chain the transaction goes out on. This used to be disconnected from the chain:
     the listing said ETH while the coins were locked on whatever chain the backend was connected to, so the frontend
     had to ask "which one are you on" -- which is why there could only ever be one of the four chains. Now the
     network states which chain it is for itself. */
  const chain = (chains?.chains ?? []).find(c => c.code === curNet) ?? null
  /* Pass the address: Privy often holds more than one wallet (everyone gained an empty one once the custodial
     wallet was enabled), and taking one by index gets the empty one, reading a balance of 0. */
  const tx = useWalletTx(chain, w?.address)
  const onChain = chains?.impl === 'evm'
  /* The wallet type decides where the confirmation is signed: an external wallet pops its own window, an Atara
     wallet goes through a passkey. The user can change it in the confirmation dialog -- some people have both, and which to use when listing is their call. */
  const { toast } = useToast()
  const { data: me } = useApi(() => ep.me(identity), [identity])
  const [via, setVia] = useState<'atara' | 'ext' | null>(null)
  /* Whether this account has a passkey to assert. Read here rather than asked
     of the sheet: the sheet only labels the button, the approval happens in
     send(). */
  const { user: privyUser } = usePrivy()
  const hasPasskey = (privyUser?.linkedAccounts ?? []).some(a => a.type === 'passkey')

  /*
    How the coins get into escrow. Two routes, as in console.html (bindFundVia).

    The Atara wallet signs `lockListing` itself, so the coins leave a wallet this
    browser can reach. The external route asks for nothing: we show an address,
    the maker sends from wherever the coins actually are — an exchange, a cold
    wallet, a multisig — and the backend watches the chain for the arrival.

    That second route exists because the first one cannot serve a desk whose
    inventory is not in a hot wallet. Requiring a signature would mean moving the
    treasury to sign for one listing.
  */
  /* The external deposit address and the amount to send, from /offers/prepare.
     Fetched once only: each call issues a new listing id and writes a new awaiting-deposit row, so toggling back and
     forth between those two chips leaves a trail of records nobody will ever use. */
  const [dep, setDep] = useState<PreparedOffer | null>(null)
  const [depErr, setDepErr] = useState('')
  const [sent, setSent] = useState(false)
  /* The real progress after clicking "I have transferred it".

     Without it that button is an empty gesture: clicked or not, transferred or not, the screen looks the same. And
     this is the step with the highest uncertainty -- a wrong amount, a wrong chain, an exchange's withdrawal fee will
     all leave the money short or absent, while the person waits forever for something that will never happen. */
  const [got, setGot] = useState<DepositStatus | null>(null)
  /* Sheet dismissed while a deposit is still on its way.

     Closing used to wipe `dep` and `sent` together with the sheet. The coins were
     already sent, the backend was still watching the address, but nothing on
     screen could show that any more: the poll below stopped with the sheet, so
     the "listed" toast never fired either. Now closing only hides the sheet;
     the deposit state stays, the poll keeps running, and a strip on the form
     leads back here. */
  const [hidden, setHidden] = useState(false)
  /* The ones where coins are locked but nothing was posted.

     Two sources: the localStorage copy is what this browser recorded itself -- fast, and carrying the locking
     transaction's hash; the server copy is computed from deposit rows plus the on-chain lock, and after switching
     device or clearing site data it is all that remains. Used merged; see mergeRecoverable. */
  const uid = me?.id ?? ''
  const [stranded, setStranded] = useState<StrandedLock | null>(null)
  useEffect(() => { setStranded(readStranded(uid)) }, [uid])
  const { data: serverStranded, reload: reloadStranded } =
    useApi(() => ep.strandedLocks(identity), [identity])
  /* Every half minute the backend goes to the chain to claim those ownerless locks (see ConfirmListingLocks) and
     emits an event when it does. The browser has no way of knowing that happened, so it is listened for here --
     otherwise this card would sit on "not yet confirmed" while the backend confirmed it long ago.

     The same path fires when the listing is created: the list then comes back empty and the notice disappears by itself. */
  useEffect(() => {
    addEventListener(LIVE_CHANGED, reloadStranded)
    return () => removeEventListener(LIVE_CHANGED, reloadStranded)
  }, [reloadStranded])
  /* Ids already posted within this session. The server list will not exclude them until the next fetch. */
  const [done, setDone] = useState<string[]>([])
  const recoverable = mergeRecoverable(stranded, serverStranded, done)
  const sell = curSide === 'Sell crypto'
  const pending = sent && !!dep
  /* Placed before the address-fetching section: the effect below reads it, and that effect has to sit above every
     early return in the component (see the note there). */
  const walletKind = via ?? (me?.wallet_kind === 'ext' ? 'ext' : 'atara')
  /* The external-deposit route: a sell listing funded from a wallet we never
     touch. Most of the sheet below branches on it. */
  const ext = sell && walletKind === 'ext'

  /* This section has to stay **above** every early return in this component.

     Below there is a "if the terms and this version's supported coins do not intersect, return the whole block as
     Nothing listable" -- and once that fires, the hooks after it are never called, and the moment React sees fewer
     hooks run than last time it throws "Rendered fewer hooks than expected" on the spot, taking the whole console down.
     This error was caught by eslint-plugin-react-hooks; neither the eye nor a regex found it. */
  /* Request a deposit address.

     This step already issues the listing id and writes a "waiting on this money" row on the backend -- so it is done
     once only. Toggling back and forth between those two chips leaves a trail of records that will never see their
     money, each of which the watcher reads off the chain every few seconds. */
  /* Fetch as soon as the panel becomes visible, rather than waiting for someone to click that chip.

     An account signed in with an external wallet has walletKind 'ext' by default (see the via ?? ... line above), so
     the panel is already there when the dialog opens and the click never happens -- it would sit on "Getting an
     address..." forever, only moving after switching to Atara and back. Bound to "visible", both entry paths are covered. */
  useEffect(() => {
    if (confirm && sell && walletKind === 'ext') void askAddress()
    // askAddress has its own idempotence check and is left out of the deps, or it would rerun on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, sell, walletKind])

  /* Poll only once the person has said the coins are sent.

     Nobody on chain notifies us, so we have to ask; each ask is one RPC, and most
     of the time there is no deposit in flight at all. Every 3 seconds follows the
     pace of blocks landing, not the pace of a UI trying to look responsive.

     The poll does not stop when the sheet is hidden: the deposit is still on its
     way, and this loop is the only thing that turns its arrival into a receipt. */
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState(0)
  /* Check once more by hand. The polling path runs on its own; this button exists for the question "is it still
     working?" -- while waiting, a button that responds is more reassuring than a spinner. */
  const recheck = async () => {
    if (!dep?.offer_id || checking) return
    setChecking(true)
    try {
      setGot(await ep.depositStatus(dep.offer_id, identity))
      setCheckedAt(Date.now())
    } catch { /* on a failed read, keep the previous state */ } finally { setChecking(false) }
  }

  useEffect(() => {
    if (!sent || !dep?.offer_id) return
    let alive = true
    const look = async () => {
      try {
        const d = await ep.depositStatus(dep.offer_id, identity)
        if (!alive) return
        setGot(d)
        setCheckedAt(Date.now())
        if (!d.listed) return
        /* Once the listing is out, finish exactly as the signing path does: one toast, then swap the card for an
           acknowledgement.

           A posted listing is a posted listing, and should not look different because the coins were transferred in.
           This used to replace the grey middle line inside the card with "your listing is up" -- while the headline
           still said "33 USDT" and the bottom still shouted "POSTING LOCKS FUNDS INTO ESCROW", so the whole card
           still looked like "what you are about to do". Nobody would read that one line as success. */
        alive = false
        const o = await ep.offer(dep.offer_id)
        toast(`Listed · ${Number(o.qty).toLocaleString()} ${o.asset} locked in escrow`,
          { kind: 'ok' })
        resetSheet()
        onPosted(o, sym)
      } catch { /* on a failed read, keep the previous state rather than wiping out progress already shown */ }
    }
    void look()
    const t = setInterval(() => void look(), 3000)
    return () => { alive = false; clearInterval(t) }
  }, [sent, dep?.offer_id, identity])

  const askAddress = async () => {
    if (dep || !confirm) return
    setDepErr('')
    try {
      const p = await ep.prepareOffer(confirm, identity)
      if (!p.deposit_addr) {
        setDepErr('This server has no deposit address configured yet.')
        return
      }
      setDep(p)
    } catch (e) {
      setDepErr(e instanceof Error ? e.message : 'Could not get a deposit address')
    }
  }

  /* Which fiat can be settled is decided by the receiving accounts selected in the configuration -- without an
     account in that country, you should not tell the world you accept that money. This used to be an aspiration:
     rails were names picked from the bank catalog with no relation to the address book. Now a rail is an account, so it actually holds. */
  const tradableFiat = (fiatCorridors ?? []).flatMap(c => c.assets.map(a => a.code))
  const fromRails = [...new Set((accts ?? [])
    .filter(a => (terms?.rails ?? []).includes(a.id)).map(a => a.currency))]
  const fiats = (fromRails.length ? fromRails : tradableFiat).filter(f => tradableFiat.includes(f))
  const curFiat = fiats.includes(fiat) ? fiat : (fiats[0] ?? '')

  const sym = FIAT_SYM[curFiat] ?? ''
  /* The balance on the network the listing will lock on. The same coin sits on
     several chains as several rows; matching on the asset alone picked the
     first row, so a maker listing on BSC was shown -- and pre-checked against
     -- their balance on whatever chain the wallet listed first. */
  const avail = num(w?.assets.find(a => a.asset === curCoin && a.network === curNet)?.on_chain
    ?? w?.assets.find(a => a.asset === curCoin && !a.network)?.on_chain ?? '0')

  /* Reference price. This version only settles US dollar stablecoins, so "the coin's dollar price" is always 1 and
     the index is the fiat index itself -- swap this for a quote once a real market feed is connected. */
  const idx = FX_IDX[curFiat] ?? 1
  const spread = terms?.pricing === 'Float' ? (parseFloat(String(terms.spread)) || 0) : 0
  const quote = +(idx * (1 + spread / 100)).toFixed(2)

  /* The prefill has to be written into state for real. Rendering value={px || quote} looks the same, but then the
     box can never be cleared: delete it all -> px becomes '' -> it immediately renders the suggested price back, and
     the next keystroke lands after 7.34 making it 7.345.
     Change the coin or the fiat and the pricing basis changes, so the old price is void and is refilled from the new
     index -- which is what the reference does too.
     The minimum trade size is filled once only: that "Per-trade limits (CNY)" row in the terms asks for this very
     number, there is no sense in making people copy it again, and leaving it blank means being blocked by an error at submission. */
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

  const post = () => {
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
    setBad({ id: '' })
    /* A deposit is already in flight: bring that sheet back instead of opening a
       new one. A new body would reuse the old address (askAddress is idempotent
       on `dep`), so the amount on screen and the amount the watcher expects
       could disagree. One pending deposit at a time. */
    if (pending) { setHidden(false); return }
    /* Pause once after validation passes so the person can see it clearly: after this the coins enter the contract
       irreversibly.
       The reference inserts a step here too (requireVerify), with different wording for sell and buy -- a sell
       listing locks money while a buy listing is only a commitment. */
    setConfirm({
      side: (sell ? 'sell' : 'buy') as 'sell' | 'buy', asset: curCoin, fiat: curFiat,
      unit_price: String(p), qty: String(q), min_lot: String(m),
      network: curNet, networks: [curNet],
    })
  }

  /* Full reset: the sheet is over, whatever it was showing.

     Drop this address. The next sheet is another listing (amount or price may
     have changed) and the address is derived from those fields — keeping the
     old one would send coins somewhere that no longer matches. */
  const resetSheet = () => {
    setConfirm(null)
    setHidden(false)
    setDep(null)
    setSent(false)
    setGot(null)
    setDepErr('')
  }

  /* What ✕, the backdrop and the Close button do.

     While a deposit is in flight, closing only hides the sheet — the coins are
     out there and the watcher is still counting them. The one exception is an
     expired price: nothing more will happen to that deposit from here, so
     closing it really is the end. */
  const closeSheet = () => {
    if (pending && got?.status !== 'expired') { setHidden(true); return }
    resetSheet()
  }

  const send = async (body: OfferBody) => {
    setBusy(true)
    /* On a real chain a sell listing is three steps, and the order cannot change:
         (1) request an id -- lockListing's offerId is the contract's primary key, and without an id there is nothing to lock against
         (2) the wallet signs approve + lockListing, and the coins really enter the contract
         (3) create the listing with that id, and the backend checks against the chain what was locked
       A buy listing locks nothing (the fiat leg goes through banks) and needs only one step.

       A failure after (2) and before (3) must not restart from (1): that would be a second id and a second lock.
       So the id is written down the moment (2) succeeds (see StrandedLock), it stays there when (3) fails, and the
       retry picks up from (3). extra is declared outside the try so catch can read it too -- when something fails,
       "did the coins enter the contract" decides how the sentence has to be worded. */
    let extra: { offer_id?: string; lock_tx?: string } = {}
    try {
      /* A buy listing locks nothing, so there is no transaction — but posting
         it is a public commitment to pay, and it is approved the way every
         other commitment here is: an external wallet signs a message that
         states the listing, the Atara wallet asserts its passkey. Neither is
         checked server-side (see the note in useIdentity); it is the same tier
         as the confirmation token createOffer already carries, made visible.
         An Atara wallet with no passkey yet has nothing to assert and goes
         straight through. */
      if (!sell) {
        if (walletKind === 'ext') {
          await tx.signMessage(
            `Atara listing — buy ${body.qty} ${body.asset} at ${sym}${body.unit_price} per ${body.asset}, ` +
            `min lot ${sym}${body.min_lot}, settled in ${body.fiat}, on ${body.network}.`)
        } else if (hasPasskey) {
          await assertPasskey()
        }
      }
      /* The passkey step comes first. It is the person's authorisation of
         this listing, and the coins move on chain in the very next step —
         asking for it afterwards (which createOffer used to do on its own)
         meant approving and locking first, then being asked "do you agree?",
         and a "no" left the coins locked with nothing to show for it. */
      let confirmation: string | undefined
      if (sell) confirmation = await ep.confirmOffer(body.asset, body.qty, identity)

      if (onChain && sell && chain?.deployed) {
        /* These coins have already been locked once (the previous create failed), so create the listing with their
           id -- preparing again would get a new id and the wallet would lock a second set, leaving the first unclaimed.

           Looked up in the merged copy, not the local one alone: when the previous lock happened on another device,
           the local copy remembers nothing while the server does. */
        const held = recoverable.find(r => sameLock(r, body)) ?? null
        if (held) {
          extra = { offer_id: held.offer_id, lock_tx: held.lock_tx }
        } else {
          const prep = await ep.prepareOffer(body, identity)
          const hash = await tx.lockListing({
            escrow: prep.escrow, token: prep.token,
            offerKey: prep.offer_key, amountWei: prep.amount_wei, asset: body.asset,
          })
          extra = { offer_id: prep.offer_id, lock_tx: hash }
          /* Record it at the very moment the coins enter the contract, before creating the listing. The window
             between these two lines is the only stretch where money has moved with nothing recording it, so keep it as short as possible. */
          const mark: StrandedLock = {
            offer_id: prep.offer_id, lock_tx: hash, body, at: Date.now(),
          }
          writeStranded(uid, mark)
          setStranded(mark)
        }
      }
      let o: Offer
      try {
        o = await ep.createOffer({ ...body, ...extra }, identity, confirmation)
      } catch (e) {
        /* The token lives 120 s and the wallet may have taken longer than that
           over approve + lock. The coins are locked under extra.offer_id by
           now, so do not start over: sign once more and post the same listing.
           Any other failure is a real one and propagates. */
        const stale = e instanceof ApiError && /^(CONFIRMATION_|SIGNATURE_REQUIRED$)/.test(e.code)
        if (!stale || !sell) throw e
        const again = await ep.confirmOffer(body.asset, body.qty, identity)
        o = await ep.createOffer({ ...body, ...extra }, identity, again)
      }
      /* The listing was created, this lock has been claimed, and the traces on both sides can be erased. */
      clearStranded(uid)
      setStranded(null)
      if (extra.offer_id) setDone(d => [...d, extra.offer_id as string])
      reloadStranded()
      tx.setStep({ k: 'idle' })
      setConfirm(null)
      /* Say it landed, and say whether coins actually moved.

         Posting a sell listing ends with a wallet signature and then the card
         simply swaps to a receipt — the one thing the person was waiting to
         hear, that the lock went through on chain, was never said out loud.
         Off-chain postings get their own wording rather than a claim about
         escrow that did not happen. */
      toast(
        extra.lock_tx
          ? `Listed · ${Number(body.qty).toLocaleString()} ${body.asset} locked in escrow`
          : `Listed · ${Number(body.qty).toLocaleString()} ${body.asset}`,
        { kind: 'ok' })
      onPosted(o, sym)
    } catch (e) {
      // Errors from the wallet side have already been shown on the transaction progress line; do not repeat them.
      // Decided by error type rather than tx.step -- the step inside that closure is the stale value from when this click started.
      if (!isWalletTxError(e)) {
        /* If the coins have entered the contract, say so. A bare "Could not post" makes people think nothing at all
           happened -- while their wallet really is missing that money, and their next move is most likely to click
           again. The notice below goes on to say what to do. */
        const msg = e instanceof Error ? e.message : 'Could not post'
        setErr(extra.lock_tx ? `${msg} — your coins are locked in escrow, not lost.` : msg)
      }
    } finally { setBusy(false) }
  }

  /* Repost coins that are already locked.

     No prepare and no locking: the id and the transaction both exist, and the only missing step is creating the
     listing. The backend deduplicates retries by offer_id, so however many times this button is pressed there will
     only ever be one listing -- and if the previous attempt really did succeed and only lost its response, it hands
     that one back unchanged. */
  const repost = async (rec: Recoverable) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const confirmation = await ep.confirmOffer(rec.body.asset, rec.body.qty, identity)
      const o = await ep.createOffer(
        { ...rec.body, offer_id: rec.offer_id, lock_tx: rec.lock_tx }, identity, confirmation)
      if (stranded?.offer_id === rec.offer_id) {
        clearStranded(uid)
        setStranded(null)
      }
      setDone(d => [...d, rec.offer_id])
      reloadStranded()
      toast(`Listed · ${Number(o.qty).toLocaleString()} ${o.asset} locked in escrow`, { kind: 'ok' })
      onPosted(o, FIAT_SYM[rec.body.fiat] ?? '')
    } catch (e) {
      /* This id is already taken by a listing.

         The contract treats the same id as a top-up (`_lockListing` does total += amount), so these coins are inside
         that listing's lock -- getting them back means delisting it, not retrying here. What leads here is a stale
         local record: on another device the same id was reposted at a different price, while this browser still
         remembers the old one. Keeping it would only leave a notice that can never be acted on. */
      if (e instanceof ApiError && e.code === 'OFFER_EXISTS') {
        if (stranded?.offer_id === rec.offer_id) {
          clearStranded(uid)
          setStranded(null)
        }
        setDone(d => [...d, rec.offer_id])
        reloadStranded()
        setErr('Those coins are already part of a listing you posted — '
          + 'delist it to take them out of escrow.')
      } else if (!isWalletTxError(e)) {
        setErr(e instanceof Error ? e.message : 'Could not post')
      }
    } finally { setBusy(false) }
  }

  /* Unlock a "listing delisted but coins still locked in the contract" lock.

     It goes through the same two-step delisting flow: the backend first says "your turn to sign" (UNLOCK_REQUIRED),
     and the wallet comes back to settle up after signing. A failed second step does not matter either -- the chain
     is already unlocked, and every thirty seconds the backend reconciles against the chain and squares the books;
     saying "unlock failed" at that point would be untrue. */
  const unlock = async (rec: Recoverable) => {
    if (busy) return
    setBusy(true)
    setErr('')
    let unlocked = false
    try {
      try {
        await ep.delistOffer(rec.offer_id, identity)
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'UNLOCK_REQUIRED')) throw e
        const prep = await ep.prepareDelist(rec.offer_id, identity)
        await tx.unlockListing({ escrow: prep.escrow, offerKey: prep.offer_key })
        unlocked = true
        await ep.delistOffer(rec.offer_id, identity)
      }
      setDone(d => [...d, rec.offer_id])
      reloadStranded()
      toast(`Unlocked · ${rec.body.asset} is back in your wallet`, { kind: 'ok' })
    } catch (e) {
      if (unlocked) {
        setDone(d => [...d, rec.offer_id])
        reloadStranded()
        toast('Coins unlocked · the record catches up within a minute', { kind: 'info' })
      } else if (!isWalletTxError(e)) {
        setErr(e instanceof Error ? e.message : 'Could not unlock those coins')
      }
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
  /** What this row should say right now: what went wrong this time if something did, otherwise its standing notice. */
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
          {/* A changed pricing basis voids the old price, so clear it and let it refill from the new index */}
          {chips(coins, curCoin, setCoin)}
          {sell && (
            <span className="ad num" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
              {avail.toLocaleString()} {curCoin} available — locks into escrow while listed
            </span>
          )}
        </div>

        <div className="sf"><span className="sfl">Network</span>
          {chips(nets, curNet, setNet)}
          {chain && (
            <span className="ad" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
              {chain.name} · chain {chain.chain_id}
              {chain.testnet ? ' · testnet — these coins have no value' : ''}
              {onChain && sell && !chain.deployed
                ? ' · no escrow contract deployed here yet' : ''}
            </span>
          )}
        </div>

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
        <TxNote step={tx.step} explorer={chain?.explorer ?? ''} />

        {/* Coins in the contract with no listing created.

            It states a fact that has already happened (the coins were locked) and an action not yet finished
            (posting them), so it is not an error message but a to-do -- an error message disappears with the next
            click, this one does not, and it only disappears once the listing is really created.

            No "got it" button: dismissing it does not give the coins back, and this is the only entry point those
            coins have in the UI. Not wanting them after posting means delisting, and only then does the contract
            refund.

            **Posting has to be clicked by a person.** The backend recognises this lock and stores the original form,
            so technically it could post it by itself -- but what they agreed to when locking was "list that much at
            that price", and that may have been two hours ago. The coins cannot go anywhere inside the contract (the
            maker it recognises is them, and delisting refunds to their own address), so there is no need to decide
            for them here. The backend's job is only to let them know.

            A list rather than a single entry: there are two sources (locally recorded, server-computed), and the
            server may well have more than one -- those broken off halfway on another device, for instance. */}
        {recoverable.map(rec => rec.delisted ? (
          /* The mirror image: a listing already taken down whose coins the
             contract still holds. The way out is the unlock, not a repost --
             this id has a listing on it, and posting again would be refused. */
          <div className="fstat warn" key={rec.offer_id}>
            <i />
            <span>
              <b className="num">{Number(rec.available ?? rec.body.qty).toLocaleString()} {rec.body.asset}</b>
              {' '}from a listing you took down is still locked in escrow — the listing
              came down before the contract let the coins go. They are yours; unlock
              to take them back to your wallet.
            </span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => void unlock(rec)}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        ) : (
          <div className="fstat warn" key={rec.offer_id}>
            <i />
            <span>
              <b className="num">{Number(rec.body.qty).toLocaleString()} {rec.body.asset}</b>
              {' '}is locked in escrow from an earlier attempt that did not finish
              posting. We checked the contract — the coins are there and they are
              yours. Nothing goes on the book until you say so: post it at the rate
              below, or post it and then delist to take the coins back out.
            </span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => void repost(rec)}>
              {busy ? 'Posting…' : 'Post it'}
            </button>
          </div>
        ))}

        {/* The way back to a deposit whose sheet was dismissed. Same .fstat block
            as inside the sheet, same live line: the thing being waited for has
            not changed, only where it is shown. */}
        {pending && hidden && dep && (() => {
          const w = waitLine(got)
          return (
            <div className={'fstat ' + w.tone}>
              <i />
              <span>
                <b className="num">{dep.deposit_total} {curCoin}</b> on its way to escrow · {w.text}
                {checkedAt > 0 && <em className="fchk">{checkedText(checkedAt)}</em>}
              </span>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setHidden(false)}>Show</button>
            </div>
          )
        })()}

        {/* Say what posting does on the route that is selected. The two-transaction
            line is true of the Atara wallet only; next to a pending external
            deposit it contradicted the strip right above it. */}
        {onChain && sell && chain?.deployed && (
          <p className="rnote">
            {walletKind === 'ext'
              ? <>Posting shows an escrow address on {chain.name}. Send from any
                  wallet; the coins lock the moment they arrive.</>
              : <>Posting sends two transactions from your own wallet on {chain.name}:
                  one to approve the escrow contract, one to lock the coins into it.</>}
          </p>
        )}
        {onChain && sell && chain && !chain.deployed && (
          <p className="rnote" style={{ color: 'var(--warn)' }}>
            No escrow contract is deployed on {chain.name} yet, so coins cannot be locked
            there. Pick another network, or deploy to this one first.
          </p>
        )}

        <div className="dfoot" style={{ marginTop: 14 }}>
          {/*
            The way back to the terms sits here, next to the action it blocks.

            Every field above is bounded by the trading terms — which assets,
            which networks, which rails. So the moment a maker discovers the
            terms are wrong is while standing on this form, reading a note
            saying the network they picked has no escrow contract. Putting the
            fix in a chat message further up means finding it by scrolling back
            through the conversation that led here.
          */}
          {onEditTerms && (
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy}
              onClick={onEditTerms}>Change trading terms</button>
          )}
          {/* While a deposit is in flight this button reopens that sheet (see
              post()), so it must not promise a new listing. */}
          <button className="btn btn-primary" disabled={busy}
            onClick={() => post()}>{pending ? 'Back to deposit' : <>Review &amp; post</>}</button>
        </div>
      </div></div></div>

      {confirm && !hidden && (
        <ConfirmSheet
          title="Confirm listing"
          /* On the external route the headline is the number to send, fee
             included — that is what gets typed into a withdrawal form. The
             listing size moves down into the sentence. Showing the listing size
             big and the send amount small had people copying the wrong one. */
          /* A buy listing is money going out, so the headline is the fiat it
             commits — quantity × rate — and the coins go into the sentence.
             The sell headline stays in coins: that is what gets locked. */
          amount={ext && dep ? String(dep.deposit_total)
            : sell ? num(qty).toLocaleString()
            : `${sym}${(num(qty) * num(px)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          unit={sell ? curCoin : curFiat}
          walletKind={walletKind}
          busy={busy}
          lead={ext ? <>
            Lists <b className="num">{num(qty).toLocaleString()} {curCoin}</b> at{' '}
            <b className="num">{sym}{num(px).toLocaleString()}</b>, min lot{' '}
            <b className="num">{sym}{num(min).toLocaleString()}</b>.
            {dep ? <> Includes the <b className="num">{dep.deposit_fee} {curCoin}</b> fee.</> : null}
          </> : sell ? <>
            List <b className="num">{num(qty).toLocaleString()} {curCoin}</b> for sale at{' '}
            <b className="num">{sym}{num(px).toLocaleString()}</b> · min lot{' '}
            <b className="num">{sym}{num(min).toLocaleString()}</b>.
            Funds stay locked until filled or unlisted.
          </> : <>
            Buy <b className="num">{num(qty).toLocaleString()} {curCoin}</b> at{' '}
            <b className="num">{sym}{num(px).toLocaleString()}</b> per {curCoin}, paying up to{' '}
            <b className="num">{sym}{(num(qty) * num(px)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
            {' '}· min lot <b className="num">{sym}{num(min).toLocaleString()}</b>.
          </>}
          extra={sell ? (
            <>
              {/* The route locks once they say the coins are sent — not before.

                  Switching to the Atara wallet after that would hide the address
                  block, turn the button back into "Confirm with passkey", and one
                  more click would sign a second listing while the external deposit
                  is still being watched. Same terms, two listings.

                  Locking earlier (on the address itself) was tried and felt broken:
                  the address is fetched the moment the panel shows, so someone who
                  only opened External wallet to look could never switch back, with
                  nothing on screen saying why. Before "I've sent it" nothing has
                  moved, so switching is free; the fetched address is kept, and
                  coming back shows the same one instead of minting another. */}
              <div className="fvia">
                <button type="button" className={'sfchip' + (walletKind !== 'ext' ? ' on' : '')}
                  disabled={sent} title={sent ? 'Locked while the deposit is being watched' : undefined}
                  onClick={() => setVia('atara')}>Atara wallet</button>
                <button type="button" className={'sfchip' + (walletKind === 'ext' ? ' on' : '')}
                  disabled={sent} title={sent ? 'Locked while the deposit is being watched' : undefined}
                  onClick={() => setVia('ext')}>External wallet</button>
              </div>
              {/* One line under the chips: what this route is, or, once sent,
                  why the chips stopped working. A greyed control with no
                  explanation reads as a bug. */}
              <div className="fviabody">
                {walletKind !== 'ext'
                  ? 'Signed from your Atara wallet — straight into the escrow contract, not to Atara.'
                  : sent
                    ? 'Route locked while this deposit is being watched.'
                    : depErr || (!dep
                      ? 'Getting an address…'
                      : 'Send from any wallet. We watch the contract and post the listing when the coins land.')}
              </div>

              {/* The external deposit, laid out like an exchange deposit page:
                  QR first and centred (scanning is the first action), the address
                  in a field with its own Copy, parameters as label-over-value cells,
                  then one neutral notice carrying the wrong-chain warning.

                  The block stays after "I've sent it". Collapsing it to a status
                  line looked broken, and that is exactly when people re-check the
                  address and the amount. Only the notice gives way to progress. */}
              {walletKind === 'ext' && dep && (
                <div className="fdep">
                  {/* The code encodes exactly the string in the field below (see Qr). */}
                  <div className="fqrc"><Qr text={dep.deposit_addr ?? ''} size={136} /></div>

                  <div className="ffield">
                    <span className="flab">Deposit address</span>
                    <div className="faddrf">
                      <span className="fadr">{dep.deposit_addr}</span>
                      {chain?.explorer && (
                        <a className="esxp" href={`${chain.explorer}/address/${dep.deposit_addr}`}
                          target="_blank" rel="noopener" title="View on explorer">↗</a>
                      )}
                      <CopyButton text={dep.deposit_addr ?? ''} label="Copy address"
                        done="Address copied" />
                    </div>
                  </div>

                  {/* The fee is added before the transfer so the listing locks the
                      round number they configured; deducting on arrival would turn
                      a 2,000 listing into 1,999.5. "included" says the headline
                      already has it.

                      Refunds: we never know who paid. An external deposit often
                      comes from an exchange's pooled address shared by thousands of
                      customers, and refunding there drops the coins into a hole.

                      Expiry: what expires is this configuration, not the address.
                      A price set at ¥7 is not the listing they would post tomorrow;
                      the address stays valid and whatever lands there stays theirs. */}
                  <div className="fdgrid">
                    <div className="fcell"><span>Network</span><b>{chain?.name ?? curNet}</b></div>
                    <div className="fcell"><span>Fee</span>
                      <b className="num">{dep.deposit_fee} {curCoin} · included</b></div>
                    <div className="fcell"><span>Refunds to your account</span>
                      <b className="num">{shortAddr(me?.address)}</b></div>
                    <div className="fcell"><span>Price holds until</span>
                      <b className="num">{expiresText(dep.deposit_expiry)}</b></div>
                  </div>

                  {sent ? (() => {
                    const w = waitLine(got)
                    return (
                      /* The only thing changing on the card. The clock under the
                         text answers "is the poll still running". */
                      <div className={'fstat ' + w.tone}>
                        <i />
                        <span>{w.text}
                          {checkedAt > 0 && <em className="fchk">{checkedText(checkedAt)}</em>}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => void recheck()}>
                          {checking ? 'Checking…' : 'Check now'}
                        </button>
                      </div>
                    )
                  })() : (
                    /* Read before sending. The wrong-chain line is the sentence
                       every exchange puts here; the other two must be known before
                       the transfer, not after. */
                    <div className="fnotice">
                      <IInfo />
                      <span>
                        Send only <b>{curCoin}</b> on <b>{chain?.name ?? curNet}</b> to this
                        address. Refunds go to your account, never back to the sender.
                        After the price expires, coins sent here are still yours to take back.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
          /* No warning once the transfer is done. That sentence was issued about "you are about to lock money", and
             the money has already gone -- continuing to warn about a decision already made only makes people think
             something is still unfinished. The only thing to say on screen at this point is the progress line. */
          /* The external deposit carries its own notice above, and after the
             coins are sent a warning about "posting" would describe a decision
             already made. Every other route keeps the shared ⚠ line. */
          note={ext
            ? undefined
            : sell
            ? { why: 'Posting locks funds into escrow',
                how: 'They stay there until someone fills the listing, or you unlist.' }
            : { why: 'Posting a public listing',
                how: 'Nothing is locked — a buy listing is a commitment to pay, not an escrow.' }}
          /* The external deposit tier does not go through send().

             send() would sign a lockListing -- and the whole point of this tier is that no signature is needed.
             Clicking here only means "I have transferred it": whether the money arrived is the watcher's call, and it
             makes no difference whether they click at all, so this click sends no request and only switches the card
             into its waiting state.

             The listing is created by the backend once the money arrives, not here. */
          onConfirm={() => {
            if (sell && walletKind === 'ext') {
              /* Once transferred, the only remaining action is to walk away. The listing goes up by itself and
                 staying here shows nothing more -- so the button becomes close, rather than a dead grey key. */
              if (sent) { closeSheet(); return }
              setSent(true)
              return
            }
            void send(confirm)
          }}
          /* This tier must never fall back to the default copy under any circumstances. The default is "Sign in your
             wallet" -- and the whole point of this path is that no signature is needed, so saying that here tells the
             person that what they just did does not count. */
          plain={sell && walletKind === 'ext'
            ? (sent ? 'Close' : "I've sent it")
            : undefined}
          /* Once the coins are sent there is nothing left to confirm. A primary
             blue Close reads as one more commitment; secondary says "you may go". */
          quiet={sent && sell && walletKind === 'ext'}
          /* On the listing sheet the passkey button reads "Approve". */
          okLabel="Approve"
          blocked={sell && walletKind === 'ext' && !dep}
          onClose={closeSheet} />
      )}
    </div>
  )
}

/**
 * How far the wallet side has got.
 *
 * There are two signatures, with a wait for a block in between -- without saying so, the second dialog looks like a
 * failed retry, and while waiting the UI sits still and people assume it has hung and click a second time.
 */
function TxNote({ step, explorer }: { step: TxStep; explorer: string }) {
  if (step.k === 'idle') return null
  if (step.k === 'error') {
    return <p className="dnote" style={{ color: 'var(--warn)' }}>{step.msg}</p>
  }
  const hash = 'hash' in step ? step.hash : ''
  return (
    <p className="dnote">
      {step.k === 'wallet' && <>{step.msg} …</>}
      {step.k === 'mining' && <>{step.msg} — waiting for the transaction to confirm</>}
      {step.k === 'done' && <>Confirmed on chain</>}
      {hash && explorer ? (
        <> · <a className="lnk" href={`${explorer}/tx/${hash}`} target="_blank"
          rel="noopener">view transaction</a></>
      ) : null}
    </p>
  )
}

/** The card after posting: left in the conversation, it is the record of that listing. */
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
