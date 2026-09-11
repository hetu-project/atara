import { useState } from 'react'
import * as ep from '../api/endpoints'
import { isWalletTxError, useWalletTx, type TxStep } from '../hooks/useWalletTx'
import { useApi } from '../hooks/useApi'
import { BankAccountsPanel } from './BankAccounts'
import Qr from './Qr'
import { ICopy } from './icons'
import type { Allowance, Wallet, WalletAsset } from '../api/types'

/**
 * 账户页那四个动作的弹窗：收款 / 提现 / 收款方 / 额度。
 *
 * 之前这四个按钮是空的——没有 onClick，点了什么都不发生。参照里它们各自
 * 开一个弹窗（openDeposit / openWithdraw / openPayees / openAllowanceModal），
 * 接口后端也早就有了，只是前端没接。
 */

/* 每条链的手续费用什么币付。表里没有的一律说「按该链的原生币」，
   不编一个具体数字——编出来的数字会被当成报价。 */
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
const netName = (n: string) => NET_NAME[n] ?? n
/* 地址格式按链族走，不按币种——同一条链上所有代币共用一个地址。
   按币种算是上一版的 bug：USDT 和 USDC 都在 Polygon 上，却给出两个地址。 */
const CHAIN_OF = (n: string) => (n === 'TRON' ? 'tron' : n === 'BTC' ? 'btc' : 'evm')

function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>{title}</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">{children}</div>
      </div>
    </div>
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

  /* 只列这一版真的看得见的链。
     
     后端只连一条 RPC，余额就只从那条链上读。把四条链都摆出来的话，有人会
     选 Ethereum、把 USDT 打到这个地址上，然后在界面上永远看不到它——币没丢
     （EVM 地址是同一个），但这个产品对它一无所知，那比不给这个选项更糟。 */
  const live = (chains?.chains ?? []).filter(c => c.deployed).map(c => c.code)
  const all = cur?.networks ?? []
  const nets = live.length ? all.filter(n => live.includes(n)) : all
  const hidden = all.length - nets.length

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
              onClick={() => setNet(n)}>{netName(n)}</button>
          ))}
        </div>
        {hidden > 0 && (
          <span className="ad" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
            This build only watches {nets.join(' · ')}. Coins sent on another network
            stay in your wallet, but will not show up here.
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
            <button className="btn btn-secondary btn-sm btn-icon" title="Copy address"
              aria-label="Copy wallet address"
              onClick={() => navigator.clipboard?.writeText(addr)}><ICopy /></button>
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
        Receives <b>{useCoin}</b> on <b>{netName(useNet)}</b> only.
        {/* 还没有这个币种的余额行时说清楚：钱到了才会长出来，
            否则收完款回到账户页看不到那一行，会以为丢了。 */}
        {!held.some((h: { asset: string }) => h.asset === useCoin)
          && ` A ${useCoin} balance on ${netName(useNet)} appears once the first deposit confirms.`}
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
  const [step, setStep] = useState(0)
  const [pick, setPick] = useState<WalletAsset | null>(null)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')

  /* 余额为 0 的不列：转不出去的东西摆在选择列表里，只会让人点进去才发现。 */
  const sendable = assets.filter(a => Number(a.on_chain) > 0)
  const net = pick?.network ?? ''
  const fee = FEE[net] ?? "paid in the chain's native coin"

  /* 每条链自己的地址格式；表里没有的按 EVM。 */
  const okTo = (v: string) => (ADDR_RE[net] ?? /^0x[0-9a-fA-F]{40}$/).test(v.trim())

  const submit = async () => {
    const v = to.trim()
    if (!okTo(v)) { setErr(`That is not a ${net} address`); return }
    const n = Number(amount)
    if (!(n > 0) || n > Number(pick!.on_chain)) {
      setErr('Must be above 0 and within what is available'); return
    }
    setBusy(true); setErr('')
    try {
      await ep.createWithdrawal(
        { to_address: v, to_chain: net, asset: pick!.asset, amount }, identity)
      setSent(v); onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign')
    } finally { setBusy(false) }
  }

  if (sent) {
    return (
      <Sheet title="Signed" onClose={onClose}>
        <p className="rnote">
          {amount} {pick?.asset} → <b className="num">{shortAddr(sent)}</b>.
          {' '}<b>The transfer is broadcast from your own wallet</b> — the platform never
          holds your coins, so it only records that you signed this.
        </p>
        <div className="dfoot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
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

      {step === 0 ? (
        <>
          <div className="walist">
            {sendable.map(a => (
              <button type="button" className="warow" key={a.asset}
                onClick={() => { setPick(a); setTo(''); setAmount(''); setErr(''); setStep(1) }}>
                <span className="anm"><b>{a.asset}</b>
                  <em>{a.network}
                    {Number(a.in_escrow) > 0 ? ` · ${a.in_escrow} locked` : ''}</em></span>
                <span className="waval"><b className="num">{a.on_chain}</b><em>available</em></span>
                <span className="wago" aria-hidden>›</span>
              </button>
            ))}
          </div>
          {sendable.length < assets.length && (
            <p className="rnote">Assets with nothing available are not listed.</p>
          )}
          {!sendable.length && <div className="fempty">Nothing available to send.</div>}
        </>
      ) : (
        <>
          <button type="button" className="wpicked" onClick={() => { setStep(0); setErr('') }}>
            <span className="anm"><b>{pick!.asset}</b>
              <em>{net} · {pick!.on_chain} available</em></span>
            <span className="wachg">Change</span>
          </button>

          <div className="sf"><span className="sfl">To</span>
            <input type="text" className="mono" autoFocus value={to} spellCheck={false}
              autoComplete="off" placeholder={`Paste a ${net} address`}
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

          <div className="sf"><span className="sfl">Amount ({pick!.asset})</span>
            <input type="text" value={amount} inputMode="decimal"
              placeholder={`Available ${pick!.on_chain}`}
              onChange={e => { setAmount(e.target.value); setErr('') }} />
          </div>

          <dl className="sfsum">
            <div><dt>Network</dt><dd>{net}</dd></div>
            <div><dt>Network fee</dt><dd className="num">{fee}</dd></div>
          </dl>

          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

          <div className="dfoot">
            <button className="btn backbtn" onClick={() => { setStep(0); setErr('') }}>Back</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Signing…' : 'Review'}
            </button>
          </div>
        </>
      )}
    </Sheet>
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
