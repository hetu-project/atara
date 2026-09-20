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
 * 账户页那四个动作的弹窗：收款 / 提现 / 收款方 / 额度。
 *
 * 之前这四个按钮是空的——没有 onClick，点了什么都不发生。参照里它们各自
 * 开一个弹窗（openDeposit / openWithdraw / openPayees / openAllowanceModal），
 * 接口后端也早就有了，只是前端没接。
 */

/* Network fee is an estimate in the chain's native coin, not a quote.
   Keys are chain families — BSC-TESTNET looks up BSC. */
const FEE: Record<string, string> = {
  ETH: '~0.002 ETH', POLYGON: '~0.01 POL', ARBITRUM: '~0.0001 ETH',
  BASE: '~0.0001 ETH', BSC: '~0.0005 BNB', TRON: '~1 TRX', BTC: '~0.0001 BTC',
}
/* 地址格式按链走。没列的按 EVM（0x + 40 位十六进制）。 */
const ADDR_RE: Record<string, RegExp> = {
  TRON: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  BTC: /^(bc1[ac-hj-np-z02-9]{25,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
}
const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a)

/* 网络的全名。芯片上写 POLYGON 是代码，写 Polygon 才是这条链的名字。 */
const NET_NAME: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', POLYGON: 'Polygon', TRON: 'TRON',
  BSC: 'BNB Chain', ARBITRUM: 'Arbitrum', BASE: 'Base', OPTIMISM: 'Optimism',
}
/* 兜底用的短名。正经的显示名来自后端 /catalog/chain 的 name 字段——
   这张表只覆盖后端没发的那几个码（资产目录里还留着 TRON/BTC 之类）。
   靠这张表当主力会漏：后端发的是 ETHEREUM，表里写的是 ETH，于是那一格
   直接印出大写的代码；BSC-TESTNET 更是压根没有。 */
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
/* 地址格式按链族走，不按币种——同一条链上所有代币共用一个地址。
   按币种算是上一版的 bug：USDT 和 USDC 都在 Polygon 上，却给出两个地址。 */
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
 * 两步之间的切换。对照 beui 的 Morphing Modal：硬切会让人觉得弹窗换了一张，
 * 其实只是同一次发送往前走了一步。
 *
 * 不用 Framer Motion（对照清单写过：到现在没有一处需要它）。左右位移是 CSS；
 * 高度要量完才知道，所以量的那一下在这里。
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

// ── 收款 ────────────────────────────────────────────────────────────

export function ReceiveModal({ w, onClose }: { w: Wallet | null; onClose: () => void }) {
  /* 资产和网络取自目录，不是持仓。收款的前提恰恰是「还没有」——
     用持仓来填这两排，新账户就是两个空标签，弹窗看着像坏了。 */
  const { data: cat } = useApi(() => ep.assets(), [])
  const { data: chains } = useApi(() => ep.chainInfo(), [])
  const held = w?.assets ?? []
  const list = (cat ?? []).map(a => ({ asset: a.code, networks: a.networks ?? [] }))
  const [coin, setCoin] = useState('')
  const useCoin = list.some(a => a.asset === coin) ? coin : (list[0]?.asset ?? '')
  const cur = list.find(a => a.asset === useCoin)

  /* 网络这一排全部来自后端：/catalog/assets 说这个币在哪几条链上，
     /catalog/chain 说哪几条链上真的部署了合约。两份都照发，不在前端裁。
  
     原来只列「已部署」的那几条，于是这里只剩一个 BSC-TESTNET——而这是**你
     自己的地址**，主网上的 USDT 打过来一样在你钱包里（EVM 地址是同一个）。
     把选项藏掉并不能阻止别人往这个地址打款，只会让人以为这个账户收不了主网
     的币。该说的是另一件事：哪几条链这个控制台会去查余额。所以全列出来，
     没索引的那几条在底下照实讲清楚。 */
  const live = (chains?.chains ?? []).filter(c => c.deployed).map(c => c.code)
  const nets = cur?.networks ?? []
  // 链名以后端为准，前端那张表只是兜底。
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
            {/* 说的是「这儿看不看得到」，不是「能不能收」。地址是你自己的，
                任何一条 EVM 链上打过来的币都在你钱包里。 */}
            Balances are read from {live.map(name).join(' · ')} in this build.
            Coins received on another network are still yours — they just will not
            appear in this console.
          </span>
        )}
      </div>

      <div className="depaddr">
        {/* 编码的就是右边那串地址——见 Qr 里的说明。 */}
        <Qr text={addr} />
        <div className="depmeta">
          <span className="sfl">Your wallet address</span>
          <div className="depline">
            <code>{addr}</code>
            <CopyButton text={addr} label="Copy wallet address" done="Wallet address copied" />
          </div>
          {/* 同一条链族共用一个地址。不说这句，用户会以为换个网络就要换地址，
              于是每换一次都重新复制一遍。 */}
          {CHAIN_OF(useNet) === 'evm' && (
            <span className="depsame">The same address works on every EVM network.</span>
          )}
        </div>
      </div>

      <p className="rnote depnote">
        Your own address — funds land in your wallet, not with us.
        Receives <b>{useCoin}</b> on <b>{name(useNet)}</b> only.
        {/* 还没有这个币种的余额行时说清楚：钱到了才会长出来，
            否则收完款回到账户页看不到那一行，会以为丢了。 */}
        {!held.some((h: { asset: string }) => h.asset === useCoin)
          && ` A ${useCoin} balance on ${name(useNet)} appears once the first deposit confirms.`}
        {' '}Sending another asset or another network cannot be recovered.
      </p>
    </Sheet>
  )
}

// ── 法币收款账户 ────────────────────────────────────────────────────

/**
 * 法币收款账户 —— 对手方把钱打到哪儿。
 *
 * 这一版按已部署的模板收窄成纯法币。原来这张表还带一栏「链上地址簿」，
 * 两件事摆在一个叫「Addresses」的入口后面，而它们回答的不是同一个问题：
 * 银行账户是别人怎么把钱给我（法币腿的落点，必须先登记，对手方照着打款）；
 * 链上地址是我把币转去哪儿（Send 当场输、按网络校验，从来不需要先存）。
 *
 * 地址簿因此没有留下：Send 不读它，存一份只是多一处要维护、又会过期的副本。
 * 后端 /payees 还在，没有界面指向它了。
 */
export function BankAccountsModal({ identity, onClose }: { identity: string; onClose: () => void }) {
  return (
    /* 这张表自己会讲清楚——顶上那句 .fnote 就是「我们从不收法币」。
       弹窗这一层不要再补一段总结：它会挂在列表的「+ Add account」下面，
       填表时又挂在「Add account」按钮下面，把两个视图的收尾都推远了一截。 */
    <Sheet title="Fiat accounts" onClose={onClose}>
      <BankAccountsPanel identity={identity} />
    </Sheet>
  )
}

// ── 提现 ────────────────────────────────────────────────────────────

/**
 * 转账。两步：先选转哪种资产，再填往哪儿转。
 *
 * 顺序只能这样——资产决定链，链决定地址长什么样。反过来让地址去猜链，
 * 0x 地址就得再补一排「ETH / POLYGON」让人选，那是顺序错了的症状。
 *
 * 之前那套「只能打到登记地址 + 用途 + 证明文件」是托管所的提币流程：
 * 托管所能这么要求是因为钱在它手里。我们是非托管的——既拦不住这笔转账，
 * 也没有立场问「为什么转」。安全层只留一条：转出前把地址完整摊开让人核对。
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

  /* 余额为 0 的不列：转不出去的东西摆在选择列表里，只会让人点进去才发现。 */
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

  /* 每条链自己的地址格式；表里没有的按 EVM。 */
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
      const hash = isNative
        ? await wtx.transferNative({ to: v, amountWei: wei.toString() })
        : await wtx.transferToken({ token: tok!.address, to: v, amountWei: wei.toString() })
      try {
        await ep.broadcastWithdrawal(wd.id, hash, identity)
      } catch {
        /* The coins already left the wallet. A failed record is not a failed send. */
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

          {/* 地址一旦成形就把话说在这儿。链上转账没有撤回，
              提醒必须出现在按下确认之前，不是之后。 */}
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

/** 钱包那一侧走到哪一步了。要签名、要等区块，不说清楚人会以为卡死了。 */
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

// ── 额度 ────────────────────────────────────────────────────────────

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
    expires: edit?.expires_at ? '90 days' : '90 days',
  })
  /* 出错的是哪一行。只在底下挂一句话的话，人盯着按钮以为没反应——
     截图里那句「Per-payment cap cannot exceed the window cap」就是这样：
     校验其实跑了、也拦下了，但没人知道该改哪个框。 */
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
      /* 外部钱包：额度在链上就是对支出合约的一笔 approve，必须由用户的钱包
         签。以前这颗按钮写着「Approve in wallet」却只是 POST 给后端，由后端
         拿自己的私钥去签——批的是后端的币，用户钱包里一分没动。 */
      const tok = chain?.tokens?.[useCoin]
      if (walletKind === 'ext' && chain?.deployed && chain.spending && tok?.address) {
        const wei = BigInt(Math.round(Number(f.window_cap) * 10 ** tok.decimals)).toString()
        await wtx.approveSpending({
          spending: chain.spending, token: tok.address, amountWei: wei,
        })
      }
      await ep.saveAllowance({
        spender: f.spender.trim(), kind: 'agent',
        asset: useCoin, network: useNet,
        per_payment: f.per_payment, window_cap: f.window_cap,
        cycle: f.cycle, expires: f.expires === 'Not set' ? '' : f.expires,
        /* 收款方范围这一排参照删掉了。接口还收这个字段，就按「不限」发过去，
           而不是把一个界面上问不到的选择留成空值。 */
        recipients: 'Any',
      }, edit?.id, identity)
      const name = f.spender.trim()
      toast(edit ? `Allowance updated — ${name}` : `Allowance issued to ${name}`)
      onDone()
    } catch (e) {
      // 钱包那一侧的错已经在交易进度那里显示过了，别再重复一遍
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
        {/* 「Me」是自己的支出策略，改名没有意义——那不是一个可以改叫别的名字的对象 */}
        <input type="text" value={f.spender} autoComplete="off" spellCheck={false} disabled={me}
          onChange={e => { setBad(null); setF({ ...f, spender: e.target.value }) }} />
        <span className="err">{bad?.id === 'spender' ? bad.msg : ''}</span></div>

      {/* 额度是对某条链上某个代币合约的授权，两样都得问清楚。同一个币在
          四条链上是四份互不相干的授权，不问的话它们会混成一份。 */}
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

      {/* 周期跟上限是一件事——「每周 2000」拆成两行读起来是两个独立设置 */}
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
          {/* 签在哪儿由钱包类型决定：外部钱包是对支出合约 approve，
              自建钱包才是 passkey 签账户策略。写错就是在教用户找一个不存在的弹窗。 */}
          {busy ? 'Signing…' : walletKind === 'ext' ? 'Approve in wallet' : 'Sign with passkey'}
        </button>
      </div>
    </Sheet>
  )
}
