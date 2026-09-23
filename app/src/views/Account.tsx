import { useEffect, useState } from 'react'
import CoinMark, { coinHue } from '../components/CoinMark'
import CountUp from '../components/CountUp'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import CopyButton from '../components/CopyButton'
import { CHIP, IArrow, IBank, ICheck, IPen, IReceive, ISend } from '../components/icons'
import { useApi } from '../hooks/useApi'
import { useKycGate } from '../hooks/useKycGate'
import { useToast } from '../components/Toast'
import { AllowanceModal, BankAccountsModal, ReceiveModal, SendModal } from '../components/WalletModals'
import { go } from '../hooks/useRoute'
import type { Allowance, WalletAsset } from '../api/types'
import { Failed, Pending } from '../components/Loading'

const fmtAmt = (n: number) =>
  n < 1 ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : n.toLocaleString()

type Tab = 'assets' | 'listings' | 'act'

/**
 * The account page = the full picture of funds.
 *
 * Non-custodial: balances and escrow positions are reported separately, because they genuinely are two places --
 * what is in the wallet is yours, what is in the contract is locked, and only together do they make the total.
 */
/** This is the shape of the display name the backend gives an unnamed account; compare against it to decide "has never been named". */
const shortAddr = (a: string) =>
  a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a

export default function Account({ identity }: { identity: string }) {
  const kyc = useKycGate()
  const [tab, setTab] = useState<Tab>('assets')
  /* The wallet's three buttons and "new allowance" used to be empty -- no onClick, nothing happening on click. */
  const [sheet, setSheet] = useState<'' | 'receive' | 'send' | 'bank' | 'allowance'>('')
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  /* What was put in when editing started. "Has it changed?" has to be compared against this, not against the display
     name -- an unnamed account's display name is an abbreviation while what is put in is the full address, so
     compared against the display name it always counts as "changed", and doing nothing but blurring would save the
     full address as the name. */
  const [initial, setInitial] = useState('')
  const [pick, setPick] = useState<string>('')
  const [flip, setFlip] = useState(false)
  const { data: me, reload: reloadMe } = useApi(() => ep.me(identity), [identity])
  /* An incoming chain transfer is not an Atara event: /events stays quiet
     when someone Sends USDT. This page used to fetch wallet once on enter,
     so a recipient sitting here never left the old balance. 15s matches the
     order-page backstop — the figure comes from RPC, not the scheduler. */
  const { data: w, error: wErr, reload: reloadW } =
    useApi(() => ep.wallet(identity), [identity], 15000)
  const { data: allow, error: allowErr, reload } = useApi(() => ep.allowances(identity), [identity])
  /* The listings list has to follow the live stream: with the external deposit tier, the listing is created by the
     **backend after the person has left** (created once the money arrives), and the browser has no way of knowing it happened. */
  const { data: mine, error: mineErr, reload: reloadOffers } =
    useApi(() => ep.myOffers(identity), [identity])
  useEffect(() => {
    addEventListener(LIVE_CHANGED, reloadOffers)
    return () => removeEventListener(LIVE_CHANGED, reloadOffers)
  }, [reloadOffers])
  const { data: orders, error: ordersErr, reload: reloadOrders } =
    useApi(() => ep.orders(identity), [identity])
  const { toast } = useToast()

  const saveName = async () => {
    const v = draft.trim()
    setRenaming(false)
    if (!v || v === initial) return
    try {
      await ep.rename(v, identity)
      reloadMe()
    } catch (e) {
      /* The field already closed. An inline error has nowhere to sit. */
      toast(e instanceof Error ? e.message : 'Could not update the name', { kind: 'err' })
    }
  }

  const cards = allow ?? []
  const card = cards.find(c => c.id === pick) ?? cards[0]
  const assets = w?.assets ?? []
  /* The gas coin sits in the list but is not a token: it cannot be listed or
     granted as an allowance, so pickers and defaults take this subset. Send
     is the exception — it is real money in the wallet and has its own
     value-transfer path, so Send gets the full list. */
  const tradable = assets.filter(a => !a.native)
  /* Listings still up: sold out (filled) and delisted ones do not count. They no longer tie up money and cannot be
     taken, and leaving them under "Your listings" only suggests they are still on the market. */
  const live = (mine ?? []).filter(o => o.status === 'active')
  /* The wallet cell has not been read yet.
   *
   * `avail === 0` cannot be used to decide this -- genuinely having no money and not having read yet must be two
   * different things on screen.
   * Painting $0 first and then jumping to the real figure is telling a lie that people will act on (and one that
   * looks exactly like the truth, so nobody will check it). First paint only: by the 15-second refresh the number
   * is already on screen, and reverting to a skeleton then looks like a fault. */
  const loadingWallet = w === null
  const avail = Number(w?.on_chain_usd ?? 0)
  const esc = Number(w?.in_escrow_usd ?? 0)
  const escN = assets.filter(a => Number(a.in_escrow) > 0).length
  const addr = w?.address ?? me?.address ?? ''
  const ini = (me?.display_name?.trim()[0] ?? 'D').toUpperCase()
  const closed = (orders ?? []).filter(o => o.terminal)

  return (
    <div className="view on" id="v-rules">
      <div className="vbody" id="rulesbody">
        {/* Identity: the address is the account; email is only a notification channel */}
        <div className="rsec">
          <div className="pid">
            {/* A badge, not a button. It used to be a <button title="Change
                avatar"> with no handler: pointer cursor, a hover shade, a
                promise, and nothing behind it — there is no avatar upload on
                either side yet. When that ships, this is where the control goes. */}
            <span className="pfav" aria-hidden>{ini}</span>
            <div className="pidmain">
              <div className="pnrow">
                {/* The pencil used to have no onClick and did nothing when clicked. Renaming goes through POST /me and
                    changes only the display name -- the address is the account's unique key, and orders, allowances
                    and contacts all hang off the address, so a rename does not affect them. */}
                {renaming ? (
                  /* The styles hang off `.pname input` -- in the reference .pname is the outer span with the input
                     inside it. Written as <input className="pname">, not one of those rules matches, leaving the
                     browser default of white text on white. */
                  <span className="pname">
                    <input autoFocus value={draft} maxLength={64}
                      aria-label="Nickname"
                      /* 11ch only fits a nickname; what is put in may be a 42-character address */
                      style={{ width: `${Math.max(11, draft.length + 1)}ch` }}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => void saveName()}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void saveName()
                        // Esc means "never mind" -- exit unchanged, write nothing to the database
                        if (e.key === 'Escape') { setDraft(initial); setRenaming(false) }
                      }} />
                  </span>
                ) : (
                  <>
                    {/* Do not invent a name when the account cannot be read. This used to say 'Demo', so "/me is
                        down" looked on screen like "your name is Demo" -- a perfectly normal-looking sentence that
                        nobody would check. The sidebar has already been changed once for the same reason. */}
                    <span className="pname">{me?.display_name ?? '—'}</span>
                    <button className="pedit" title="Rename" aria-label="Edit nickname"
                      /* For an account that has never been named, the display name is the abbreviated address
                         (0xFC3d...4443). Putting the abbreviation into the input means editing against an ellipsis --
                         so the full address goes in instead. Accounts with a real name keep using the name. */
                      onClick={() => {
                        const n = me?.display_name ?? ''
                        const v = n === shortAddr(me?.address ?? '') ? (me?.address ?? '') : n
                        setDraft(v); setInitial(v); setRenaming(true)
                      }}>
                      <IPen />
                    </button>
                  </>
                )}
              </div>
              <div className="pmeta">
                <span className="num" title="Your wallet address is your account">
                  {addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''}
                </span>
                {addr ? (
                  <CopyButton text={addr} label="Copy address" done="Address copied"
                    className="pcopy" />
                ) : null}
                {/* The separator lives inside the span rather than beside it: .pmeta is a flex row and a bare
                    text node is its own flex item, so on a narrow screen the email wraps to the next line and
                    leaves the dot stranded at the end of the one above. */}
                {me?.email ? (
                  <span title="Notification email — codes and notices, not a login">· {me.email}</span>
                ) : null}
              </div>
            </div>
            <div className="pstat">
              <b>{me?.kind === 'firm' ? 'Business account' : 'Personal account'}</b>
              {/* In the reference this is a hardcoded "verified" -- it was a static demo where the Demo user was always
                  verified. Carried into a real system it becomes a lie: a newly opened account has submitted nothing
                  yet shows as verified, and a second later placing an order is blocked by the identity door, with the two contradicting each other. */}
              {kyc.kycOk ? (
                <span className="pok"><ICheck /> {me?.kind === 'firm' ? 'Business' : 'Individual'} KYC verified</span>
              ) : kyc.kycPending ? (
                <span>Identity in review</span>
              ) : (
                <button className="lnk" type="button" onClick={() => kyc.openMaker()}>Verify identity →</button>
              )}
            </div>
          </div>
        </div>

        <div className="pgrid pg-a">
          <section className="pmod">
            <div className="pmh"><h4>Wallet</h4><span className="ad">Non-custodial</span></div>
            {/* The bars below stay grey on failure rather than turning into
                $0; this line says why they are grey. */}
            {loadingWallet && wErr && <Failed error={wErr} onRetry={reloadW} compact />}
            <div className="atot"><b className="av num">
              {loadingWallet ? <i className="sk" style={{ width: '6.5em' }} /> : <>$<CountUp value={avail + esc} /></>}
            </b></div>
            {/* The allocation bar stays empty until read, rather than being drawn as 100% available -- that would assert something not yet known. */}
            <div className="aalloc" title="Available vs in escrow">
              {!loadingWallet && <>
                <i className="aa-av" style={{ width: `${(avail / (avail + esc || 1) * 100).toFixed(1)}%` }} />
                <i className="aa-es" style={{ width: `${(esc / (avail + esc || 1) * 100).toFixed(1)}%` }} />
              </>}
            </div>
            <div className="asplit">
              <div><span className="al">In your wallet</span>
                <b className="num">
                  {loadingWallet ? <i className="sk" style={{ width: '4em' }} /> : <>$<CountUp value={avail} /></>}
                </b></div>
              {/* Three states, not two. The chain being unreadable used to
                  render as $0 — on the one line of this page whose job is to
                  say where money that is not in the wallet has gone. A zero
                  there reads as "nothing is locked", which is the opposite of
                  "I could not find out". */}
              <div><span className="al">In escrow contracts</span>
                <b className="num">
                  {loadingWallet ? <i className="sk" style={{ width: '4em' }} />
                    : w?.escrow_unknown ? <span className="adim">—</span>
                      : <>$<CountUp value={esc} /></>}
                </b>
                <span className="ad">{loadingWallet ? ' '
                  : w?.escrow_unknown ? 'Could not read the contract just now — retrying'
                    : <>{escN} trades locked ·{' '}
                      <a href="#/payments" className="lnk">View ›</a></>}</span></div>
            </div>
            <div className="aacts">
              <button className="btn btn-secondary aact-in" onClick={() => setSheet('receive')}>
                <span className="aact-ic"><IReceive /></span>
                <span className="aact-lb">Receive</span>
              </button>
              <button className="btn btn-secondary aact-out" onClick={() => setSheet('send')}>
                <span className="aact-ic"><ISend /></span>
                <span className="aact-lb">Send</span>
              </button>
              {/* "Fiat accounts" rather than "Addresses": this cell governs the fiat leg's destination, while
                  on-chain addresses are typed into Send on the spot, validated per network, and never need registering.
                  A vague "Addresses" covers both, and you only learn which on clicking in. */}
              <button className="btn btn-secondary aact-bank" onClick={() => setSheet('bank')}>
                <span className="aact-ic"><IBank /></span>
                <span className="aact-lb">Fiat accounts</span>
              </button>
            </div>
          </section>

          <section className="pmod">
            <div className="pmh">
              <h4>Allowances
                <i className="info" tabIndex={0} data-tip="A spending rule your wallet signed — the contract enforces spender, per-payment cap, window total and expiry; revoking takes effect next block.">i</i>
              </h4>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setSheet('allowance')}>+ New allowance</button>
            </div>
            {card ? (
              <Card c={card} all={cards} flip={flip} onFlip={() => setFlip(f => !f)}
                onPick={setPick} asset={tradable[0]?.asset ?? 'USDT'}
                /* Revoke lives in the edit dialog, not under the card -- see the note in Card. */
                onEdit={() => { setEditing(true); setSheet('allowance') }} />
            ) : allow === null ? (
              allowErr ? <Failed error={allowErr} onRetry={reload} compact /> : <Pending rows={2} />
            ) : <p className="rnote">No allowances yet.</p>}
          </section>
        </div>

        {/* Three sections: none has much content, side by side they would stretch the page, and stacked they all look alike */}
        <div className="rsec">
          <div className="atabs" role="tablist">
            {([['assets', `Assets`], ['listings', `Listings${live.length ? ` · ${live.length}` : ''}`],
               ['act', 'Activity']] as [Tab, string][]).map(([k, n]) => (
              <button key={k} className={'atab ' + (tab === k ? 'on' : '')} role="tab"
                aria-selected={tab === k} onClick={() => setTab(k)}>{n}</button>
            ))}
          </div>
          <section className="pmod">
            {tab === 'assets' && (
              <>
                {/* The count has to wait too: writing "Assets - 0" first and then jumping to 2 is the same lie. */}
                <div className="pmh"><h4>Assets{loadingWallet ? '' : ` · ${assets.length}`}</h4>
                  <button className="h3go" onClick={() => go({ view: 'payments' })}>Statement <IArrow /></button></div>
                {loadingWallet ? <Pending rows={2} /> : <Assets rows={assets} />}
                <p className="rnote">
                  Digital assets only — <b>fiat never enters the account</b>.
                  <i className="info" tabIndex={0} data-tip="The fiat leg of an OTC trade settles bank-to-bank between the two parties. We verify the receipt but never hold the funds.">i</i>
                </p>
              </>
            )}
            {tab === 'listings' && (
              <>
                <div className="pmh"><h4>Your listings</h4></div>
                {live.length ? (
                  <div className="alist2">
                    {live.map(o => (
                      <div className="arow3" key={o.id}>
                        <CoinMark asset={o.asset} />
                        <span className="anm"><b>{o.asset}</b><em>{o.side} · {o.status}</em></span>
                        <span className="aright">
                          <b className="num">{Number(o.remaining_qty).toLocaleString()}</b>
                          <em className="num">of {Number(o.qty).toLocaleString()}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : mine === null ? (
                  mineErr ? <Failed error={mineErr} onRetry={reloadOffers} compact /> : <Pending rows={2} />
                ) : (
                  <ListingsEmpty everListed={!!mine?.length} />
                )}
              </>
            )}
            {tab === 'act' && (
              <>
                <div className="pmh"><h4>Recent</h4>
                  <button className="h3go" onClick={() => go({ view: 'payments' })}>View all <IArrow /></button></div>
                <div>
                  {closed.slice(0, 6).map(o => (
                    <button className="arow2" key={o.id} onClick={() => go({ view: 'order', id: o.id })}>
                      <span className={'adot' + (o.terminal === 'completed' ? '' : o.terminal === 'disputed' ? ' dis' : ' ref')} />
                      <span className="atx"><b>{o.ref}</b>
                        <em>{o.counterparty_name} · {o.terminal === 'completed' ? 'Released' : 'Refunded'}</em></span>
                      <span className="aamt">
                        <b className="num">{Number(o.amount.amount).toLocaleString()} {o.amount.asset}</b>
                        <em className="num">{new Date(o.created_at).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}</em>
                      </span>
                    </button>
                  ))}
                  {!closed.length && (orders === null
                    ? (ordersErr
                      ? <Failed error={ordersErr} onRetry={reloadOrders} compact />
                      : <Pending rows={3} />)
                    : <p className="rnote">Nothing settled yet.</p>)}
                </div>
              </>
            )}
          </section>
        </div>
        {sheet === 'receive' && <ReceiveModal w={w ?? null} onClose={() => setSheet('')} />}
        {sheet === 'bank' && <BankAccountsModal identity={identity} onClose={() => setSheet('')} />}
        {sheet === 'send' && (
          <SendModal identity={identity} assets={assets}
            onClose={() => setSheet('')} onDone={() => reloadW()} />
        )}
        {sheet === 'allowance' && (
          <AllowanceModal identity={identity} asset={tradable[0]?.asset ?? 'USDT'}
            walletKind={me?.wallet_kind ?? 'ext'}
            edit={editing ? card : undefined}
            onRevoke={card ? async () => {
              const name = card.spender
              const live = card.status === 'live'
              try {
                await ep.revokeAllowance(card.id, identity)
                toast(
                  name === 'Me'
                    ? (live ? 'Spending disabled' : 'Spending re-enabled')
                    : (live ? `Revoked — ${name}` : `Re-issued — ${name}`),
                )
                reload(); setSheet(''); setEditing(false)
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not change that allowance', { kind: 'err' })
              }
            } : undefined}
            onClose={() => { setSheet(''); setEditing(false) }}
            onDone={() => { reload(); setSheet(''); setEditing(false) }} />
        )}
      </div>
    </div>
  )
}

function Assets({ rows }: { rows: WalletAsset[] }) {
  const tot = rows.reduce((s, x) => s + Number(x.usd_value), 0) || 1
  return (
    <div className="alist2">
      {rows.map(a => {
        const usd = Number(a.usd_value)
        const pct = usd / tot * 100
        const hue = coinHue(a.asset)
        const locked = Number(a.in_escrow)
        const bal = Number(a.on_chain)
        /* The gas coin. No USD (no quote), no share bar (not part of the
           total). The amount takes the big slot, and an empty balance is
           said out loud: every listing and transfer from this wallet fails at
           signing without it, and nothing else on the page would say why. */
        if (a.native) {
          return (
            <div className="arow3" key={a.asset}>
              <CoinMark asset={a.asset} />
              <span className="anm"><b>{a.asset}</b>
                <em>{a.network} · pays gas</em></span>
              <span className="aright">
                <b className="num">{fmtAmt(bal)} {a.asset}</b>
                <em className="num" style={bal > 0 ? undefined : { color: 'var(--warn)' }}>
                  {bal > 0 ? 'Not tradable' : 'No gas — listing and sending need it'}
                </em>
              </span>
            </div>
          )
        }
        return (
          <div className="arow3" key={a.asset}>
            <CoinMark asset={a.asset} />
            <span className="anm"><b>{a.asset}</b>
              <em>{a.network}{locked ? ` · ${fmtAmt(locked)} locked` : ''}</em></span>
            <span className="aright">
              <b className="num">${Math.round(usd).toLocaleString()}</b>
              <em className="num">{fmtAmt(Number(a.on_chain))} available</em>
              <span className="ashare" title={`${pct < 1 ? '<1' : Math.round(pct)}% of the account`}>
                <i style={{ width: `${Math.max(2, pct).toFixed(1)}%`, background: `hsl(${hue} 50% 48%)` }} />
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Allowance card. The conditions are on the face of the card -- who this card can pay and on what terms is its
 * "denomination" in the first place.
 * Flip it for the full conditions, including expiry and how it is enforced.
 */
function Card({
  c, all, flip, onFlip, onPick, asset, onEdit,
}: {
  c: Allowance; all: Allowance[]; flip: boolean; onFlip: () => void
  onPick: (id: string) => void; asset: string; onEdit: () => void
}) {
  const q = Number(c.window_cap)
  const u = Number(c.used)
  const per = Number(c.per_payment)
  const live = c.status === 'live'
  const pct = Math.min(100, q ? u / q * 100 : 0)
  const suf = ` ${c.asset || asset}`

  return (
    <div className={`card ${live ? '' : 'off'} ${c.kind === 'agent' ? 'kagent' : ''}`}>
      <div className="cdeck">
        {/* The card itself is the flip control (the reference's .ccard is also cursor:pointer + data-p="flip").
            It used to be a "Conditions" button underneath -- that row should hold only card thumbnails, and with
            three actions squeezed in, one allowance looked like four things to choose between. */}
        <div className="ccsway"><div className={'ccard' + (flip ? ' flip' : '')}
          role="button" tabIndex={0} aria-pressed={flip}
          aria-label={flip ? 'Show the front' : 'Show the limits'}
          onClick={onFlip}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip() }
          }}>
          <div className="ccface front">
            <div className="cctop"><span className="cchip2"><CHIP /></span>
              {c.kind === 'agent' ? <span className="cctag">Agent</span> : null}
              {live ? null : <span className="cctag">Off</span>}</div>
            <div className="ccnum"><b className="cq num">{u.toLocaleString()}</b>
              <span className="cqt num">/ {q.toLocaleString()}{suf} · {c.cycle}</span></div>
            <div className="ccbar"><i style={{ width: `${pct}%` }} /></div>
            {/* One line only on the front. The payee scope never made it onto the card face in the reference -- it is
                "who this card can pay", while the face answers "how much is left to spend". Squeezed together, the
                figure that most needs seeing at a glance is the one that gets squeezed small. */}
            <div className="cccond">
              <span>Up to <b className="num cper">{per ? per.toLocaleString() + suf : 'any amount'}</b> per payment</span>
            </div>
            <div className="ccfoot"><span className="ccn">{c.spender}</span></div>
          </div>
          <div className="ccface back">
            {/* The back is called Limits, not Conditions: what it lists is a few caps.
                It used to carry five rows of Release / Recipients / Enforced as well -- all of which are in the edit
                dialog, and piled onto one card back nobody remembers a single one. */}
            <div className="cctop"><span className="cctag" style={{ marginLeft: 0 }}>Limits</span></div>
            <div className="ccb">
              <div className="ccbrow"><span className="ccbk">Window</span>
                <b className="num">{q ? q.toLocaleString() + suf : 'Any amount'} · {c.cycle}</b></div>
              <div className="ccbrow"><span className="ccbk">Per payment</span>
                <b className="num">{per ? per.toLocaleString() + suf : 'Any amount'}</b></div>
              {c.expires_at && (
                <div className="ccbrow"><span className="ccbk">Expires</span>
                  <b>{new Date(c.expires_at).toLocaleDateString('en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' })}</b></div>
              )}
            </div>
            <div className="ccfoot"><span className="ccn">{c.spender}</span>
              <span className="ccy">{live ? 'Active' : 'Revoked'}</span></div>
          </div>
        </div></div>
      </div>
      <div className="cthumbs">
        {all.map(r => (
          <button key={r.id} className={`cthumb ${r.id === c.id ? 'on' : ''} ${r.status === 'live' ? '' : 'off'}`}
            style={{ ['--ch' as string]: r.kind === 'agent' ? 190 : 221 }}
            title={r.spender} aria-label={`Show ${r.spender}`} aria-pressed={r.id === c.id}
            onClick={() => onPick(r.id)}>
            {/* Thumbnails need names on them. Left blank, a row of small squares is indistinguishable, and
                "which one do I click to bring it up" becomes guesswork. */}
            <i /><span>{r.spender}</span>
          </button>
        ))}
      </div>
      {/* Actions get their own row, and there is only one. The thumbnail row answers "which one am I looking at",
          this row answers "what do I do with this one" -- mixed together, one allowance looked like four things to
          choose between. Revoke moved into the edit dialog: it is the other end of the same thing as changing an
          allowance, and it is the irreversible end, so it does not belong in the same row as "take a look". */}
      <div className="cinfo">
        <div className="cfoot">
          <span className="cacts">
            <button className="btn btn-ghost btn-sm" onClick={onEdit}><IPen />Edit</button>
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * The empty state for "your listings".
 *
 * It used to be a hardcoded "No listings. Post one from Discover." -- one sentence for three kinds of person, and
 * wrong for two of them: someone who has not applied to make markets cannot post from Discover either, and someone
 * whose submission is under review would only find a button that does nothing.
 *
 * The reference (console.html's myListingsHTML) puts it precisely in its comment here:
 * **an empty state is not a full stop, it is an entry point** -- give the door to posting if they can post, and the
 * door to onboarding if they cannot.
 * The under-review state deliberately gets no button: there is no action to take at that point, and offering one only invites repeated submissions.
 *
 * This is also the only place in the UI that shows "am I actually a merchant". Maker status is not put in the row at
 * the top of the account page, a proportion the reference settled: identity verification is account-level and takers
 * do it too, while the vast majority of users have no intention of making markets -- making it a permanent status
 * would announce to everyone "there is still something you have not done".
 */
function ListingsEmpty({ everListed }: { everListed: boolean }) {
  const { app, openMaker } = useKycGate()
  const approved = !!app?.approved
  /* "Submitted and under review" has to recognise both the identity section and the terms section: either one under review still blocks posting. */
  const review = (!!app?.listing_done && !approved) || (!!app?.kyc_done && !app?.kyc_ok)

  if (approved) {
    return (
      <div className="lsempty">
        <p className="rnote">
          {everListed
            /* Sold-out and delisted listings are not listed here -- they no longer tie up money and cannot be taken.
               Leaving them in only suggests they are still up, while the row reads 0. */
            ? 'Nothing listed right now. Filled and unlisted offers move to Activity.'
            : 'Post an offer and the coins lock into escrow until it fills.'}
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => openMaker('offer')}>
          Create a listing →
        </button>
      </div>
    )
  }
  if (review) {
    return (
      <div className="lsempty">
        <p className="rnote">Your trading terms are under review — you can post once they clear.</p>
      </div>
    )
  }
  return (
    <div className="lsempty">
      <p className="rnote">
        Listings are how makers put their own price in the pool. Get approved once,
        then post whenever you like.
      </p>
      <button className="btn btn-primary btn-sm" onClick={() => openMaker()}>
        Become a maker →
      </button>
    </div>
  )
}
