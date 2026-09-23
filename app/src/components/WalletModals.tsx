import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { parseUnits } from 'viem'
import * as ep from '../api/endpoints'
import { isWalletTxError, useWalletTx, type TxStep } from '../hooks/useWalletTx'
import { useApi } from '../hooks/useApi'
import CoinMark from './CoinMark'
import CopyButton from './CopyButton'
import { BankAccountsPanel } from './BankAccounts'
import Qr from './Qr'
import { IGo } from './icons'
import { useToast } from './Toast'
import type { Allowance, Wallet, WalletAsset } from '../api/types'

/**
 * The dialogs behind the account page's four actions: receive / withdraw / payees / allowances.
 *
 * These four buttons used to be empty -- no onClick, nothing happening on click. In the reference each opens a
 * dialog (openDeposit / openWithdraw / openPayees / openAllowanceModal), and the backend endpoints had long
 * existed; only the frontend was never wired up.
 */

/* Network fee is an estimate in the chain's native coin, not a quote.
   Keys are chain families — BSC-TESTNET looks up BSC. */
const FEE: Record<string, string> = {
  ETH: '~0.002 ETH', POLYGON: '~0.01 POL', ARBITRUM: '~0.0001 ETH',
  BASE: '~0.0001 ETH', BSC: '~0.0005 BNB', TRON: '~1 TRX', BTC: '~0.0001 BTC',
}
/* Address format follows the chain. Anything not listed follows EVM (0x plus 40 hex characters). */
const ADDR_RE: Record<string, RegExp> = {
  TRON: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  BTC: /^(bc1[ac-hj-np-z02-9]{25,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
}
const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a)

/* Full names of networks. POLYGON on a chip is a code; Polygon is the chain's name. */
const NET_NAME: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', POLYGON: 'Polygon', TRON: 'TRON',
  BSC: 'BNB Chain', ARBITRUM: 'Arbitrum', BASE: 'Base', OPTIMISM: 'Optimism',
}
/* Short names, used as a fallback. The proper display name comes from the name field of the backend's
   /catalog/chain -- this table only covers the few codes the backend does not send (the asset catalog still
   carries TRON/BTC and the like).
   Relying on this table as the primary source leaks: the backend sends ETHEREUM while the table says ETH, so that
   cell printed the uppercase code outright; BSC-TESTNET was not in it at all. */
const netName = (n: string) => NET_NAME[n] ?? n
const family = (code: string) => code.replace(/-TESTNET$/, '')
const netLabel = (code: string, name?: string) => {
  if (name) return name
  const pretty = NET_NAME[family(code)] ?? family(code)
  return code.endsWith('-TESTNET') ? `${pretty} testnet` : pretty
}
/* What Max leaves behind when sending the gas coin. The fee for a plain
   transfer on these chains is a few ten-thousandths; this covers it with room
   to spare without visibly eating into what the person wanted to send. The
   hook re-checks against the live gas price before asking for a signature. */
const NATIVE_RESERVE = 0.001

const feeLine = (code: string, native?: string) =>
  FEE[family(code)] ?? (native ? `paid in ${native}` : "paid in the chain's native coin")
const fmtAmt = (n: string | number) => {
  const x = Number(n)
  return Number.isFinite(x) ? x.toLocaleString() : String(n)
}
/* Address format follows the chain family, not the currency -- every token on a chain shares one address.
   Deriving it from the currency was the previous version's bug: USDT and USDC are both on Polygon, yet it gave two addresses. */
const CHAIN_OF = (n: string) => (n === 'TRON' ? 'tron' : n === 'BTC' ? 'btc' : 'evm')

function Sheet({
  title, onClose, children, className,
}: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  /* On <body> via a portal. The fiat-accounts sheet opens from inside the
     trading-terms card, which is a CSS container; a fixed overlay rendered
     inside a container is pinned to it, not to the viewport (see DocuPassSheet
     in IdCheck for the full reason). Every sheet goes through here, so every
     sheet is safe from that wherever it is opened from. */
  return createPortal(
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'mcard' + (className ? ' ' + className : '')}>
        <header className="mhead">
          <h3>{title}</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function Chips({
  opts, on, onPick,
}: { opts: string[]; on: string; onPick: (v: string) => void }) {
  return (
    <div className="sfchips">
      {opts.map(o => (
        <button key={o} type="button" className={'sfchip' + (o === on ? ' on' : '')}
          onClick={() => onPick(o)}>{o}</button>
      ))}
    </div>
  )
}

/**
 * Transition between the two steps. Compare beui's Morphing Modal: a hard cut makes it feel like a different
 * dialog, when it is only the same send moving one step forward.
 *
 * No Framer Motion (as the comparison list noted: nothing has needed it so far). The horizontal translate is CSS;
 * the height is only known once measured, which is what the measurement here is for.
 */
function StepSlide({
  step, children,
}: { step: 0 | 1; children: [ReactNode, ReactNode] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const prev = useRef(step)
  const fromH = useRef(0)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    if (prev.current === step) {
      fromH.current = el.offsetHeight
      return
    }
    const from = fromH.current
    const to = el.offsetHeight
    prev.current = step
    fromH.current = to
    if (from === to) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.style.height = `${from}px`
    el.style.overflow = 'hidden'
    const id = requestAnimationFrame(() => {
      el.style.transition = 'height var(--dur-normal) var(--ease)'
      el.style.height = `${to}px`
    })
    const done = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'height') return
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
    return () => {
      cancelAnimationFrame(id)
      el.removeEventListener('transitionend', done)
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
    }
  }, [step])

  return (
    <div ref={wrap} className="wslide" data-step={step}>
      {children.map((pane, i) => (
        <div key={i} className={'wslide-pane' + (i === step ? ' on' : '')}
          data-i={i} aria-hidden={i !== step}
          {...(i !== step ? { inert: true } : {})}>
          {pane}
        </div>
      ))}
    </div>
  )
}

// -- Receive ------------------------------------------------------------

export function ReceiveModal({ w, onClose }: { w: Wallet | null; onClose: () => void }) {
  /* Assets and networks come from the catalog, not from holdings. The whole premise of receiving is "not having
     any yet" -- filling these two rows from holdings leaves a new account with two empty labels and a dialog that looks broken. */
  const { data: cat } = useApi(() => ep.assets(), [])
  const { data: chains } = useApi(() => ep.chainInfo(), [])
  const held = w?.assets ?? []
  const list = (cat ?? []).map(a => ({ asset: a.code, networks: a.networks ?? [] }))
  const [coin, setCoin] = useState('')
  const useCoin = list.some(a => a.asset === coin) ? coin : (list[0]?.asset ?? '')
  const cur = list.find(a => a.asset === useCoin)

  /* The network row comes entirely from the backend: /catalog/assets says which chains this coin is on, and
     /catalog/chain says which chains actually have contracts deployed. Both are shown as sent, with no trimming in the frontend.

     It used to list only the deployed ones, leaving nothing here but BSC-TESTNET -- when this is **your own
     address**, and USDT sent on mainnet lands in your wallet just the same (the EVM address is identical).
     Hiding the option does not stop anyone sending to this address; it only makes people think this account
     cannot receive mainnet coins. The thing worth saying is different: which chains this console will check
     balances on. So list them all, and explain truthfully underneath which ones are not indexed. */
  const live = (chains?.chains ?? []).filter(c => c.deployed).map(c => c.code)
  const nets = cur?.networks ?? []
  // Chain names follow the backend; the frontend's table is only a fallback.
  const byCode = new Map((chains?.chains ?? []).map(c => [c.code, c.name]))
  const name = (n: string) => byCode.get(n) ?? netName(n)

  const [net, setNet] = useState(nets[0] ?? '')
  const useNet = nets.includes(net) ? net : (nets[0] ?? '')
  const addr = w?.address ?? ''

  return (
    <Sheet title="Receive" onClose={onClose}>
      <div className="sf"><span className="sfl">Asset</span>
        <Chips opts={list.map(a => a.asset)} on={useCoin}
          onPick={c => { setCoin(c); setNet('') }} />
      </div>
      <div className="sf"><span className="sfl">Network</span>
        <div className="sfchips">
          {nets.map((n: string) => (
            <button key={n} type="button" className={'sfchip' + (n === useNet ? ' on' : '')}
              onClick={() => setNet(n)}>{name(n)}</button>
          ))}
        </div>
        {live.length > 0 && live.length < nets.length && (
          <span className="ad" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
            {/* This is about "whether it is visible here", not "whether it can be received". The address is your
                own, and coins sent on any EVM chain are in your wallet. */}
            Balances are read from {live.map(name).join(' · ')} in this build.
            Coins received on another network are still yours — they just will not
            appear in this console.
          </span>
        )}
      </div>

      <div className="depaddr">
        {/* What is encoded is the address to the right -- see the note in Qr. */}
        <Qr text={addr} />
        <div className="depmeta">
          <span className="sfl">Your wallet address</span>
          <div className="depline">
            <code>{addr}</code>
            <CopyButton text={addr} label="Copy wallet address" done="Wallet address copied" />
          </div>
          {/* One address is shared across a chain family. Without saying so, users assume a different network needs
              a different address and re-copy it every time they switch. */}
          {CHAIN_OF(useNet) === 'evm' && (
            <span className="depsame">The same address works on every EVM network.</span>
          )}
        </div>
      </div>

      <p className="rnote depnote">
        Your own address — funds land in your wallet, not with us.
        Receives <b>{useCoin}</b> on <b>{name(useNet)}</b> only.
        {/* Say it plainly when there is no balance row for this coin yet: the row appears once the money arrives,
            otherwise coming back to the account page after receiving shows no row and people think it was lost. */}
        {!held.some((h: { asset: string }) => h.asset === useCoin)
          && ` A ${useCoin} balance on ${name(useNet)} appears once the first deposit confirms.`}
        {' '}Sending another asset or another network cannot be recovered.
      </p>
    </Sheet>
  )
}

// -- Fiat receiving accounts --------------------------------------------

/**
 * Fiat receiving accounts -- where the counterparty sends the money.
 *
 * This version is narrowed to fiat only, following the deployed template. This table used to carry an "on-chain
 * address book" column as well, putting two things behind one entry point called "Addresses" when they answer
 * different questions: a bank account is how someone else gives me money (the fiat leg's destination, which has to
 * be registered first so the counterparty can pay into it); an on-chain address is where I send coins (typed into
 * Send on the spot, validated per network, and never needing to be stored first).
 *
 * So the address book was not kept: Send does not read it, and storing a copy is only one more thing to maintain
 * that goes stale. The backend's /payees is still there, with no UI pointing at it.
 */
export function BankAccountsModal({ identity, onClose }: { identity: string; onClose: () => void }) {
  return (
    /* This table explains itself -- the .fnote at the top already says "we never hold fiat".
       This dialog layer should not add another summary: it would hang under the list's "+ Add account" and, while
       the form is open, under the "Add account" button, pushing both views' endings a good way down. */
    <Sheet title="Fiat accounts" onClose={onClose}>
      <BankAccountsPanel identity={identity} />
    </Sheet>
  )
}

// -- Withdraw -----------------------------------------------------------

/**
 * Transfer. Two steps: pick which asset to send, then fill in where to send it.
 *
 * The order can only be this way round -- the asset determines the chain, and the chain determines what the address
 * looks like. Reversed, the address has to guess the chain, and a 0x address then needs another row of
 * "ETH / POLYGON" to pick from, which is the symptom of the wrong order.
 *
 * The previous "registered addresses only + purpose + supporting document" scheme is a custodian's withdrawal
 * flow: a custodian can demand that because it holds the money. We are non-custodial -- we can neither stop this
 * transfer nor stand in a position to ask "why". One safety measure is kept: lay the address out in full for
 * checking before sending.
 */
export function SendModal({
  identity, assets, onClose, onDone,
}: {
  identity: string
  assets: WalletAsset[]
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<0 | 1>(0)
  const [pick, setPick] = useState<WalletAsset | null>(null)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{
    to: string; hash: string; amount: string; asset: string
    from: string; network: string; explorer: string
  } | null>(null)

  const { data: chains } = useApi(() => ep.chainInfo(), [])
  const { data: myWallet } = useApi(() => ep.wallet(identity), [identity])
  const { toast } = useToast()

  /* Zero balances are not listed: putting something unsendable in a picker only makes people click into it to find out. */
  const sendable = assets.filter(a => Number(a.on_chain) > 0)
  const net = pick?.network ?? ''
  const chain = (chains?.chains ?? []).find(c => c.code === net) ?? null
  const label = netLabel(net, chain?.name)
  const fee = feeLine(net, chain?.native)
  const tok = pick ? chain?.tokens?.[pick.asset] : undefined
  /* The gas coin has no token entry: it is the chain itself, 18 decimals on
     every EVM chain we run. Everything below that needs decimals reads this. */
  const isNative = !!pick?.native
  const decimals = isNative ? 18 : tok?.decimals
  const wtx = useWalletTx(chain, myWallet?.address)

  /* Max for the gas coin keeps a little back for the fee. Sending the whole
     balance of the coin that pays for the send can never go through. */
  const maxAmount = () => {
    if (!pick) return ''
    if (!isNative) return pick.on_chain
    const left = Number(pick.on_chain) - NATIVE_RESERVE
    return left > 0 ? left.toFixed(6).replace(/\.?0+$/, '') : '0'
  }

  /* Each chain's own address format; anything not in the table follows EVM. */
  const okTo = (v: string) => (ADDR_RE[net] ?? /^0x[0-9a-fA-F]{40}$/).test(v.trim())
  let amtOk = false
  if (decimals !== undefined && pick && amount) {
    try {
      const wei = parseUnits(amount, decimals)
      const avail = parseUnits(pick.on_chain, decimals)
      amtOk = wei > 0n && wei <= avail
    } catch { /* not a number */ }
  }

  const submit = async () => {
    const v = to.trim()
    if (!okTo(v)) { setErr(`That is not a ${net} address`); return }
    if (ADDR_RE[net]) {
      setErr(`Sending on ${net} is not wired in this console yet`); return
    }
    if (!isNative && !tok?.address) {
      setErr(`${chain?.name ?? net} has no ${pick!.asset} contract in this build — nothing can be sent on chain`)
      return
    }
    let wei: bigint
    let avail: bigint
    try {
      wei = parseUnits(amount, decimals!)
      avail = parseUnits(pick!.on_chain, decimals!)
    } catch {
      setErr('That is not a valid amount'); return
    }
    if (wei <= 0n || wei > avail) {
      setErr('Must be above 0 and within what is available'); return
    }
    setBusy(true); setErr('')
    try {
      /* Record the intent, then let the wallet actually transfer. We used
         to POST and jump to "Signed / broadcast from your own wallet" —
         nothing happened on chain. That was a lie. */
      const wd = await ep.createWithdrawal(
        { to_address: v, to_chain: net, asset: pick!.asset, amount }, identity)
      /* Two ways to move money on an EVM chain: a token is a contract call,
         the gas coin is a plain value transfer. Same receipt either way. */
      let hash: string
      try {
        hash = isNative
          ? await wtx.transferNative({ to: v, amountWei: wei.toString() })
          : await wtx.transferToken({ token: tok!.address, to: v, amountWei: wei.toString() })
      } catch (e) {
        /* Declined in the wallet, or it failed before a hash existed. The
           record was written first, so close it — otherwise it sits under
           "withdrawals" as something in flight for ever. */
        await ep.abandonWithdrawal(wd.id, identity).catch(() => {})
        throw e
      }
      let recorded = true
      try {
        await ep.broadcastWithdrawal(wd.id, hash, identity)
      } catch {
        /* The coins already left the wallet. A failed record is not a failed
           send — but it is not nothing either: say so, with the hash, so the
           person can paste it to support instead of finding the row stuck. */
        recorded = false
      }
      if (!recorded) {
        toast(`Sent on chain (${hash.slice(0, 10)}…) but the record did not update — keep this hash; `
          + 'the console can verify it from the chain', { kind: 'err' })
      }
      setSent({
        to: v, hash, amount, asset: pick!.asset,
        from: myWallet?.address ?? '',
        network: label,
        explorer: chain?.explorer ?? '',
      })
      onDone()
    } catch (e) {
      if (!isWalletTxError(e)) {
        setErr(e instanceof Error ? e.message : 'Could not send')
      }
    } finally { setBusy(false) }
  }

  const toRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (step !== 1) return
    const t = window.setTimeout(() => toRef.current?.focus(), 220)
    return () => clearTimeout(t)
  }, [step])

  if (sent) {
    return (
      <Sheet title="Sent" className="sentcard" onClose={onClose}>
        <SentReceipt {...sent} onClose={onClose} />
      </Sheet>
    )
  }

  return (
    <Sheet title="Send" onClose={onClose}>
      <ol className="wsteps">
        {['Asset', 'Recipient'].map((t, n) => (
          <li key={t} className={n === step ? 'on' : n < step ? 'done' : ''}>{n + 1} {t}</li>
        ))}
      </ol>

      <StepSlide step={step}>
        <>
          <div className="walist">
            {sendable.map(a => (
              <button type="button" className="warow" key={a.asset}
                onClick={() => { setPick(a); setTo(''); setAmount(''); setErr(''); setStep(1) }}>
                <CoinMark asset={a.asset} />
                <span className="anm"><b>{a.asset}</b>
                  <em>{netLabel(a.network, chains?.chains.find(c => c.code === a.network)?.name)}
                    {a.native ? ' · pays gas — keep some' : ''}
                    {Number(a.in_escrow) > 0 ? ` · ${fmtAmt(a.in_escrow)} locked` : ''}</em></span>
                <span className="waval"><b className="num">{fmtAmt(a.on_chain)}</b><em>available</em></span>
                <span className="wago" aria-hidden>›</span>
              </button>
            ))}
          </div>
          {sendable.length < assets.length && (
            <p className="rnote">Assets with nothing available are not listed.</p>
          )}
          {!sendable.length && <div className="fempty">Nothing available to send.</div>}
        </>
        <>
          <button type="button" className="wpicked" onClick={() => { setStep(0); setErr(''); wtx.setStep({ k: 'idle' }) }}>
            <CoinMark asset={pick?.asset ?? ''} />
            <span className="anm"><b>{pick?.asset}</b>
              <em>{label} · {fmtAmt(pick?.on_chain ?? '')} available</em></span>
            <span className="wachg">Change</span>
          </button>

          <div className="sf"><span className="sfl">To</span>
            <input ref={toRef} type="text" className="mono" value={to} spellCheck={false}
              autoComplete="off"
              placeholder={CHAIN_OF(net) === 'evm' ? 'Paste a 0x address' : `Paste a ${label} address`}
              onChange={e => { setTo(e.target.value); setErr('') }} />
          </div>

          {/* Say it here as soon as the address takes shape. An on-chain transfer cannot be recalled, so the warning
              has to appear before confirm is pressed, not after. */}
          {okTo(to) && (
            <div className="wnew">
              <p>Check every character against what the recipient gave you —{' '}
                <b>an on-chain transfer cannot be undone</b>.</p>
            </div>
          )}

          <div className="sf"><span className="sfl">Amount ({pick?.asset})</span>
            <div className="sf-amt">
              <input type="text" value={amount} inputMode="decimal"
                placeholder={`Available ${fmtAmt(pick?.on_chain ?? '')}`}
                onChange={e => { setAmount(e.target.value); setErr('') }} />
              <button type="button" className="sf-max" disabled={!pick}
                onClick={() => { setAmount(maxAmount()); setErr('') }}>Max</button>
            </div>
          </div>

          <dl className="sfsum sfsum-rows">
            <div><dt>Network</dt><dd>{label}</dd></div>
            <div><dt>Network fee</dt><dd className="num">{fee}</dd></div>
          </dl>

          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
          <TxLine step={wtx.step} explorer={chain?.explorer ?? ''} />

          <div className="dfoot">
            <button className="btn backbtn" disabled={busy} onClick={() => { setStep(0); setErr(''); wtx.setStep({ k: 'idle' }) }}>Back</button>
            <button className="btn btn-primary" disabled={busy || !okTo(to) || !amtOk}
              onClick={() => void submit()}>
              {busy ? 'Sending…' : 'Send in wallet'}
            </button>
          </div>
        </>
      </StepSlide>
    </Sheet>
  )
}

/**
 * Receipt after a confirmed send. The old view was one grey sentence and a
 * Close button — a transfer that already left the wallet deserves the same
 * facts a wallet shows: amount, both addresses, hash, explorer.
 */
function SentReceipt({
  amount, asset, from, to, hash, network, explorer, onClose,
}: {
  amount: string
  asset: string
  from: string
  to: string
  hash: string
  network: string
  explorer: string
  onClose: () => void
}) {
  const href = explorer && hash ? `${explorer}/tx/${hash}` : ''
  return (
    <div className="sentok" aria-live="polite">
      <div className="sentok-hero">
        <span className="sentok-mark" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5 6.2 11.7 13 4.9" />
          </svg>
        </span>
        <p className="sentok-st">Confirmed on chain</p>
        <div className="sentok-amt">
          <CoinMark asset={asset} />
          <b className="num">{fmtAmt(amount)} {asset}</b>
        </div>
        <p className="sentok-net">{network}</p>
      </div>

      <dl className="sentok-kv">
        {from ? (
          <div>
            <dt>From</dt>
            <dd>
              <code className="num">{shortAddr(from)}</code>
              <CopyButton text={from} label="Copy sending address" done="Address copied"
                className="btn btn-ghost btn-sm btn-icon" />
            </dd>
          </div>
        ) : null}
        <div>
          <dt>To</dt>
          <dd>
            <code className="num">{shortAddr(to)}</code>
            <CopyButton text={to} label="Copy recipient" done="Address copied"
              className="btn btn-ghost btn-sm btn-icon" />
          </dd>
        </div>
        {hash ? (
          <div>
            <dt>Transaction</dt>
            <dd>
              <code className="num">{shortAddr(hash)}</code>
              <CopyButton text={hash} label="Copy transaction hash" done="Hash copied"
                className="btn btn-ghost btn-sm btn-icon" />
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="sentok-note">
        The coins left your wallet — the platform never held them.
      </p>

      <div className="dfoot sentok-foot">
        {href ? (
          <a className="btn btn-secondary" href={href} target="_blank" rel="noopener">
            View transaction <IGo />
          </a>
        ) : null}
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

/** How far the wallet side has got. It needs a signature, then it waits for a block; without saying so people assume it has hung. */
function TxLine({ step, explorer }: { step: TxStep; explorer: string }) {
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

// -- Allowances ---------------------------------------------------------

export function AllowanceModal({
  identity, edit, asset, walletKind, onClose, onDone, onRevoke,
}: {
  identity: string
  edit?: Allowance
  asset: string
  walletKind: string
  onClose: () => void
  onDone: () => void
  onRevoke?: () => void
}) {
  const me = edit?.spender === 'Me'
  const { data: chains } = useApi(() => ep.chainInfo(), [])
  const { data: cat } = useApi(() => ep.assets(), [])
  const [f, setF] = useState({
    spender: edit?.spender ?? 'New agent',
    asset: edit?.asset ?? asset ?? 'USDT',
    network: edit?.network ?? '',
    per_payment: edit?.per_payment ?? '500',
    window_cap: edit?.window_cap ?? '2000',
    cycle: (edit?.cycle ?? 'weekly') as 'weekly' | 'monthly',
    /* Editing used to land on "90 days" whatever the allowance had, so every
       edit silently re-armed a 90-day clock — on a "Not set" allowance too.
       Start from what it has: no expiry stays "Not set", and a dated one
       picks the bucket its remaining time is closest to. (Picking a bucket on
       save still restarts that clock; the form has no "keep the date" option.) */
    expires: !edit ? '90 days'
      : !edit.expires_at ? 'Not set'
        : (Date.parse(edit.expires_at) - Date.now()) / 86_400_000 <= 60 ? '30 days' : '90 days',
  })
  /* Which row is wrong. With only one sentence hung underneath, people stare at the button assuming nothing
     happened -- that "Per-payment cap cannot exceed the window cap" in the screenshot was exactly this: validation
     did run and did block, but nobody could tell which box to fix. */
  const [bad, setBad] = useState<{ id: string; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const coins = (cat ?? []).map(a => a.code)
  const rows = chains?.chains ?? []
  const useCoin = coins.includes(f.asset) ? f.asset : (coins[0] ?? 'USDT')
  const useNet = rows.some(c => c.code === f.network) ? f.network : (rows[0]?.code ?? '')
  const chain = rows.find(c => c.code === useNet) ?? null
  const { data: myWallet } = useApi(() => ep.wallet(identity), [identity])
  const wtx = useWalletTx(chain, myWallet?.address)

  const submit = async () => {
    setBad(null)
    if (!f.spender.trim()) { setBad({ id: 'spender', msg: 'Spender is required' }); return }
    if (!(Number(f.per_payment) > 0)) {
      setBad({ id: 'per', msg: 'Enter a cap above zero' }); return
    }
    if (!(Number(f.window_cap) > 0)) {
      setBad({ id: 'cap', msg: 'Enter a cap above zero' }); return
    }
    if (Number(f.per_payment) > Number(f.window_cap)) {
      setBad({
        id: 'per',
        msg: `Cannot exceed the ${f.cycle} cap of ${Number(f.window_cap).toLocaleString()}`,
      })
      return
    }
    setBusy(true)
    try {
      /* External wallet: an allowance is, on chain, an approve to the spender contract and must be signed by the
         user's wallet. This button used to say "Approve in wallet" while it merely POSTed to the backend, which
         signed with its own private key -- approving the backend's coins, with nothing moved in the user's wallet. */
      const tok = chain?.tokens?.[useCoin]
      if (walletKind === 'ext' && chain?.deployed && chain.spending && tok?.address) {
        /* parseUnits, not Number × 10^decimals: at 18 decimals anything over
           ~9,007 tokens is past 2^53 and Math.round hands BigInt a float that
           is not the integer typed in. The approval on chain would differ from
           the cap on screen by a few hundred wei — small, but wrong. */
        const wei = parseUnits(f.window_cap, tok.decimals).toString()
        await wtx.approveSpending({
          spending: chain.spending, token: tok.address, amountWei: wei,
        })
      }
      await ep.saveAllowance({
        spender: f.spender.trim(), kind: 'agent',
        asset: useCoin, network: useNet,
        per_payment: f.per_payment, window_cap: f.window_cap,
        cycle: f.cycle, expires: f.expires === 'Not set' ? '' : f.expires,
        /* The payee-scope row was removed by the reference. The endpoint still accepts the field, so send it as
           "unrestricted" rather than leaving a choice the UI never asks about as an empty value. */
        recipients: 'Any',
      }, edit?.id, identity)
      const name = f.spender.trim()
      toast(edit ? `Allowance updated — ${name}` : `Allowance issued to ${name}`)
      onDone()
    } catch (e) {
      // Errors from the wallet side have already been shown on the transaction progress line; do not repeat them
      if (!isWalletTxError(e)) {
        setBad({ id: '', msg: e instanceof Error ? e.message : 'Could not sign' })
      }
    } finally { setBusy(false) }
  }

  const live = edit?.status === 'live'

  return (
    <Sheet title={edit ? 'Edit allowance' : 'New allowance'} onClose={onClose}>
      <div className={'sf' + (bad?.id === 'spender' ? ' bad' : '')}>
        <span className="sfl">Spender</span>
        {/* "Me" is your own spending policy, and renaming it is meaningless -- it is not an object that could be called something else */}
        <input type="text" value={f.spender} autoComplete="off" spellCheck={false} disabled={me}
          onChange={e => { setBad(null); setF({ ...f, spender: e.target.value }) }} />
        <span className="err">{bad?.id === 'spender' ? bad.msg : ''}</span></div>

      {/* An allowance authorises a specific token contract on a specific chain, and both have to be asked. The same
          coin on four chains is four unrelated authorisations, and without asking they would merge into one. */}
      <div className="sf"><span className="sfl">Asset</span>
        <Chips opts={coins} on={useCoin} onPick={c => setF({ ...f, asset: c })} /></div>

      <div className="sf"><span className="sfl">Network</span>
        <Chips opts={rows.map(c => c.code)} on={useNet}
          onPick={c => setF({ ...f, network: c })} />
        {chain && (
          <span className="ad" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
            {chain.name} · chain {chain.chain_id}
            {chain.testnet ? ' · testnet' : ''}
            {walletKind === 'ext' && !chain.deployed
              ? ' · no spending contract here yet — nothing will be approved on chain' : ''}
          </span>
        )}
      </div>

      <div className={'sf' + (bad?.id === 'per' ? ' bad' : '')}>
        <span className="sfl">Max per payment ({useCoin})</span>
        <input type="text" value={f.per_payment} inputMode="numeric"
          onChange={e => { setBad(null); setF({ ...f, per_payment: e.target.value }) }} />
        <span className="err">{bad?.id === 'per' ? bad.msg : ''}</span></div>

      {/* The period and the cap are one thing -- "2000 a week" split across two rows reads as two independent settings */}
      <div className={'sf' + (bad?.id === 'cap' ? ' bad' : '')}>
        <span className="sfl">Max per window ({useCoin})</span>
        <input type="text" value={f.window_cap} inputMode="numeric"
          onChange={e => { setBad(null); setF({ ...f, window_cap: e.target.value }) }} />
        <Chips opts={['weekly', 'monthly']} on={f.cycle}
          onPick={c => setF({ ...f, cycle: c as 'weekly' | 'monthly' })} />
        <span className="err">{bad?.id === 'cap' ? bad.msg : ''}</span>
      </div>

      <div className="sf"><span className="sfl">Expires</span>
        <Chips opts={['30 days', '90 days', 'Not set']} on={f.expires}
          onPick={c => setF({ ...f, expires: c })} /></div>

      <TxLine step={wtx.step} explorer={chain?.explorer ?? ''} />

      <div className="dfoot">
        {edit && onRevoke && (
          <button className="btn btn-danger backbtn" onClick={onRevoke}>
            {me ? (live ? 'Disable' : 'Enable') : (live ? 'Revoke' : 'Re-issue')}
          </button>
        )}
        <span className="dnote" style={{ color: 'var(--warn)' }}>
          {bad && !bad.id ? bad.msg : ''}
        </span>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {/* Where it is signed depends on the wallet type: an external wallet approves the spender contract, while
              a self-custody wallet signs the account policy with a passkey. Getting it wrong teaches the user to look for a dialog that does not exist. */}
          {busy ? 'Signing…' : walletKind === 'ext' ? 'Approve in wallet' : 'Sign with passkey'}
        </button>
      </div>
    </Sheet>
  )
}
