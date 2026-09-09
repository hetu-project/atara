import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import type { Allowance, Payee, Wallet, WalletAsset } from '../api/types'

/**
 * 账户页那四个动作的弹窗：收款 / 提现 / 收款方 / 额度。
 *
 * 之前这四个按钮是空的——没有 onClick，点了什么都不发生。参照里它们各自
 * 开一个弹窗（openDeposit / openWithdraw / openPayees / openAllowanceModal），
 * 接口后端也早就有了，只是前端没接。
 */

function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>{title}</h3>
          <button className="sayic" aria-label="Close" onClick={onClose}>
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
  const held = w?.assets ?? []
  const list = (cat ?? []).map(a => ({
    asset: a.code,
    networks: a.networks ?? held.find(h => h.asset === a.code)?.networks ?? [],
  }))
  const [coin, setCoin] = useState('')
  const useCoin = list.some(a => a.asset === coin) ? coin : (list[0]?.asset ?? '')
  const cur = list.find(a => a.asset === useCoin)
  const nets = cur?.networks ?? []
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
        <Chips opts={nets} on={useNet} onPick={setNet} />
      </div>

      {/* 参照这里画了一个装饰性的假二维码。收款弹窗里放一张扫不出地址的码，
          是会让人把钱打丢的那种细节，所以只留地址本身。 */}
      <div className="depaddr">
        <div className="depmeta">
          <span className="sfl">Your wallet address</span>
          <code>{addr}</code>
          <button className="btn btn-sm"
            onClick={() => navigator.clipboard?.writeText(addr)}>Copy</button>
        </div>
      </div>

      <p className="rnote">
        Your own address — funds land in your wallet, not with us.
        Receives <b>{useCoin}</b> on <b>{useNet}</b> only. Sending another asset or another
        network cannot be recovered.
      </p>
    </Sheet>
  )
}

// ── 收款方 ──────────────────────────────────────────────────────────

export function PayeesModal({ identity, onClose }: { identity: string; onClose: () => void }) {
  const { data: list, reload } = useApi(() => ep.payees(identity), [identity])
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ label: '', chain: 'ETH', address: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!f.label.trim() || !f.address.trim()) { setErr('Label and address are required'); return }
    setBusy(true); setErr('')
    try {
      await ep.addPayee({ ...f, label: f.label.trim(), address: f.address.trim() }, identity)
      setF({ label: '', chain: 'ETH', address: '' }); setAdd(false); reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally { setBusy(false) }
  }

  return (
    <Sheet title="Addresses" onClose={onClose}>
      {/* 参照里这个弹窗还有一段银行账户。后端的 Payee 只有链上地址这一种，
          编一段没有接口支撑的法币卡片，只会让人以为那里真存了银行信息。 */}
      <div className="plist">
        {(list ?? []).map((p: Payee) => (
          <div className="prow" key={p.id}>
            <span className="pav net">{p.chain.slice(0, 3)}</span>
            <span className="ptxt"><b>{p.label}</b><em className="mono">{p.address}</em></span>
            <span className="pmeta">
              <button className="lnk" type="button"
                onClick={async () => { await ep.deletePayee(p.id, identity); reload() }}>Remove</button>
            </span>
          </div>
        ))}
        {!(list ?? []).length && <div className="fempty">No registered addresses yet.</div>}
      </div>

      {add ? (
        <>
          <div className="sf"><span className="sfl">Label</span>
            <input type="text" value={f.label} autoFocus autoComplete="off"
              onChange={e => setF({ ...f, label: e.target.value })} /></div>
          <div className="sf"><span className="sfl">Network</span>
            <Chips opts={['ETH', 'POLYGON']} on={f.chain} onPick={c => setF({ ...f, chain: c })} /></div>
          <div className="sf"><span className="sfl">Address</span>
            <input type="text" value={f.address} spellCheck={false} autoComplete="off"
              onChange={e => setF({ ...f, address: e.target.value })} /></div>
          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
          <div className="dfoot">
            <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }}
              onClick={() => { setAdd(false); setErr('') }}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Save</button>
          </div>
        </>
      ) : (
        <div className="dfoot">
          <button className="btn btn-sm" onClick={() => setAdd(true)}>+ Add address</button>
        </div>
      )}

      <p className="rnote">
        Withdrawals can only go to a registered address — that is what makes a mistyped
        address a mistake you make once, not every time.
      </p>
    </Sheet>
  )
}

// ── 提现 ────────────────────────────────────────────────────────────

export function SendModal({
  identity, assets, onClose, onDone,
}: {
  identity: string
  assets: WalletAsset[]
  onClose: () => void
  onDone: () => void
}) {
  const { data: list } = useApi(() => ep.payees(identity), [identity])
  const [payee, setPayee] = useState('')
  /* 同样兜底到目录：没有余额也该看得见有哪些币可选，
     「能不能发得出去」由下面的余额校验来说，不是靠让选项消失。 */
  const { data: cat } = useApi(() => ep.assets(), [])
  const codes = (cat ?? []).map(a => a.code)
  const opts = codes.length ? codes : assets.map(a => a.asset)
  const [asset, setAsset] = useState('')
  const useAsset = opts.includes(asset) ? asset : (opts[0] ?? '')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const bal = assets.find(a => a.asset === useAsset)?.on_chain ?? '0'

  const submit = async () => {
    if (!payee) { setErr('Select an address'); return }
    if (!(Number(amount) > 0)) { setErr('Enter an amount'); return }
    if (Number(amount) > Number(bal)) { setErr(`Only ${bal} ${useAsset} available`); return }
    if (!purpose.trim()) { setErr('Purpose is required'); return }
    setBusy(true); setErr('')
    try {
      const wd = await ep.createWithdrawal(
        { payee_id: payee, asset: useAsset, amount, purpose: purpose.trim() }, identity)
      setDone(wd.id)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <Sheet title="Withdrawal recorded" onClose={onClose}>
        <p className="rnote">
          The intent and its compliance record are stored. <b>The transfer itself is signed
          by your own wallet</b> — the platform never moves your coins, so this stays at
          «submitted» until the transaction is broadcast.
        </p>
        <div className="dfoot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Send" onClose={onClose}>
      <div className="sf"><span className="sfl">Send to a registered address</span>
        {(list ?? []).length ? (
          <div className="wlist">
            {(list ?? []).map((p: Payee) => (
              <button key={p.id} className={'wrow' + (payee === p.id ? ' on' : '')}
                onClick={() => setPayee(p.id)}>
                <span className="wnet">{p.chain}</span>
                <span className="wtxt"><b>{p.label}</b>
                  <em>{p.address.slice(0, 10)}…{p.address.slice(-6)}</em></span>
                {payee === p.id ? <span className="wok">✓</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="fempty">No registered addresses yet — add one under Addresses.</div>
        )}
      </div>

      <div className="sf"><span className="sfl">Asset</span>
        <Chips opts={opts} on={useAsset} onPick={setAsset} /></div>

      <div className="sf"><span className="sfl">Amount ({useAsset})</span>
        <input type="text" value={amount} inputMode="decimal" placeholder={`Available ${bal}`}
          onChange={e => setAmount(e.target.value)} /></div>

      {/* 提现要留用途：这不是仪式，是反洗钱审查时唯一能回溯的东西 */}
      <div className="sf"><span className="sfl">Purpose</span>
        <input type="text" value={purpose} autoComplete="off" placeholder="e.g. supplier payment"
          onChange={e => setPurpose(e.target.value)} /></div>

      {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

      <div className="dfoot">
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Confirming…' : 'Continue'}
        </button>
      </div>
      <p className="rnote">
        Registered addresses only. Digital assets only — fiat never enters the account.
      </p>
    </Sheet>
  )
}

// ── 额度 ────────────────────────────────────────────────────────────

export function AllowanceModal({
  identity, edit, asset, onClose, onDone,
}: {
  identity: string
  edit?: Allowance
  asset: string
  onClose: () => void
  onDone: () => void
}) {
  const [f, setF] = useState({
    spender: edit?.spender ?? 'New agent',
    per_payment: edit?.per_payment ?? '500',
    window_cap: edit?.window_cap ?? '2000',
    cycle: (edit?.cycle ?? 'weekly') as 'weekly' | 'monthly',
    expires: edit?.expires_at ? '90 days' : '90 days',
    recipients: edit?.recipients ?? 'Any',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!f.spender.trim()) { setErr('Spender is required'); return }
    if (!(Number(f.per_payment) > 0) || !(Number(f.window_cap) > 0)) {
      setErr('Caps must be positive'); return
    }
    if (Number(f.per_payment) > Number(f.window_cap)) {
      setErr('Per-payment cap cannot exceed the window cap'); return
    }
    setBusy(true); setErr('')
    try {
      await ep.saveAllowance({
        spender: f.spender.trim(), kind: 'agent',
        per_payment: f.per_payment, window_cap: f.window_cap,
        cycle: f.cycle, expires: f.expires === 'Not set' ? '' : f.expires,
        recipients: f.recipients,
      }, edit?.id, identity)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign')
    } finally { setBusy(false) }
  }

  return (
    <Sheet title={edit ? 'Edit allowance' : 'New allowance'} onClose={onClose}>
      <div className="sf"><span className="sfl">Spender</span>
        <input type="text" value={f.spender} autoComplete="off"
          onChange={e => setF({ ...f, spender: e.target.value })} /></div>
      <div className="sf"><span className="sfl">Max per payment ({asset})</span>
        <input type="text" value={f.per_payment} inputMode="numeric"
          onChange={e => setF({ ...f, per_payment: e.target.value })} /></div>
      <div className="sf"><span className="sfl">Max per window ({asset})</span>
        <input type="text" value={f.window_cap} inputMode="numeric"
          onChange={e => setF({ ...f, window_cap: e.target.value })} /></div>
      <div className="sf"><span className="sfl">Window</span>
        <Chips opts={['weekly', 'monthly']} on={f.cycle}
          onPick={c => setF({ ...f, cycle: c as 'weekly' | 'monthly' })} /></div>
      <div className="sf"><span className="sfl">Expires</span>
        <Chips opts={['30 days', '90 days', 'Not set']} on={f.expires}
          onPick={c => setF({ ...f, expires: c })} /></div>
      <div className="sf"><span className="sfl">Recipients</span>
        <Chips opts={['Any', 'Verified providers']} on={f.recipients}
          onPick={c => setF({ ...f, recipients: c })} /></div>

      {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

      <div className="dfoot">
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Signing…' : 'Sign allowance'}
        </button>
      </div>
      <p className="rnote">
        {/* 额度是签进链上的支配权，不是平台的一张额度表——所以这一步要签名档，
            而不是一句承诺。 */}
        Signed by your wallet and enforced by the contract: spender, per-payment cap,
        window total and expiry. Revoking takes effect on the next block.
      </p>
    </Sheet>
  )
}
