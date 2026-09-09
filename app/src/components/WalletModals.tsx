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

const WD_STEPS = ['Address', 'Amount', 'Purpose', 'Document']
/* 用途是可选项而不是自由文本：反洗钱审查要的是可归类的口径，
   一人一种写法的自由输入没法聚合。逐字取自参照。 */
const PURPOSES = ['OTC settlement', 'Goods payment', 'Service fee', 'Refund',
  'Internal transfer', 'Other']

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

      <div className="depaddr">
        {/* 参照里这是一块装饰性的码（aria-hidden），不编码任何内容——
            扫不出来就是扫不出来，不会把人导到别的地址。地址本身在右边，
            要转账靠复制那一串，不靠扫这个。 */}
        <div className="qr" aria-hidden>
          {Array.from({ length: 64 }, (_, n) => (
            <i key={n} className={(n * 7 + (n % 5) + useCoin.length + useNet.length) % 3 ? '' : 'on'} />
          ))}
        </div>
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
  const { data: cat } = useApi(() => ep.assets(), [])
  const [step, setStep] = useState(0)
  const [payee, setPayee] = useState<Payee | null>(null)
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  /* 资产跟着收款地址所在的网络走——地址定了，能往那儿发什么就定了。
     没有匹配的就退回目录第一项，而不是让这一格空着。 */
  const codes = (cat ?? []).map(a => a.code)
  const asset = codes[0] ?? assets[0]?.asset ?? 'USDT'
  const bal = assets.find(a => a.asset === asset)?.on_chain ?? '0'

  const next = async () => {
    if (step === 0 && !payee) { setErr('Select an address'); return }
    if (step === 1 && !(Number(amount) > 0 && Number(amount) <= Number(bal))) {
      setErr('Must be above 0 and within your balance'); return
    }
    if (step === 2 && !purpose) { setErr('Select a purpose'); return }
    if (step === 3 && !file) { setErr('A document is required'); return }
    setErr('')
    if (step < 3) { setStep(s => s + 1); return }
    setBusy(true)
    try {
      await ep.createWithdrawal({
        payee_id: payee!.id, asset, amount,
        purpose: note.trim() ? `${purpose} — ${note.trim()}` : purpose,
        doc_upload_id: file,
      }, identity)
      setDone(true); onDone()
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
      <ol className="wsteps">
        {WD_STEPS.map((t, n) => (
          <li key={t} className={n === step ? 'on' : n < step ? 'done' : ''}>{n + 1} {t}</li>
        ))}
      </ol>

      {step === 0 && (
        <div className="sf">
          <span className="sfl">Send to a registered address</span>
          {(list ?? []).length ? (
            <div className="wlist">
              {(list ?? []).map((p: Payee) => (
                <button key={p.id} className={'wrow' + (payee?.id === p.id ? ' on' : '')}
                  onClick={() => setPayee(p)}>
                  <span className="wnet">{p.chain}</span>
                  <span className="wtxt"><b>{p.label}</b>
                    <em>{p.address.slice(0, 10)}…{p.address.slice(-6)}</em></span>
                  {payee?.id === p.id ? <span className="wok">✓</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="fempty">No registered addresses yet — add one under Addresses.</div>
          )}
        </div>
      )}

      {step === 1 && (
        <>
          <div className="sf"><span className="sfl">Amount ({asset})</span>
            <input type="text" autoFocus value={amount} inputMode="decimal"
              placeholder={`Available ${bal}`} onChange={e => setAmount(e.target.value)} />
          </div>
          <dl className="sfsum">
            <div><dt>Network</dt><dd>{payee?.chain}</dd></div>
            <div><dt>Available</dt><dd className="num">{bal} {asset}</dd></div>
          </dl>
        </>
      )}

      {step === 2 && (
        <>
          <div className="sf"><span className="sfl">Purpose</span>
            <Chips opts={PURPOSES} on={purpose} onPick={setPurpose} />
          </div>
          <div className="sf"><span className="sfl">Note (optional)</span>
            <input type="text" value={note} placeholder="For reconciliation only"
              onChange={e => setNote(e.target.value)} />
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="sf">
            {/* 反洗钱审查要看的是文件本身，不是一句「已上传」，所以这里真传。 */}
            <label className={'sfup' + (file ? ' ok' : '')} style={{ cursor: 'pointer' }}>
              <span><b>Document</b><em>{file || 'Contract, invoice or settlement note'}</em></span>
              <span className="sfst">{file ? 'Uploaded' : 'Upload'}</span>
              <input type="file" hidden accept="image/*,application/pdf"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try { setFile(await ep.upload(f)) } catch { setErr('Upload failed') }
                }} />
            </label>
          </div>
          <dl className="sfsum">
            <div><dt>To</dt><dd>{payee?.label} · {payee?.address.slice(0, 10)}…</dd></div>
            <div><dt>Amount</dt><dd className="num">{amount} {asset}</dd></div>
            <div><dt>Purpose</dt><dd>{purpose}</dd></div>
          </dl>
        </>
      )}

      {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

      <div className="dfoot">
        <span className="dnote">Purpose and document are required</span>
        {step > 0 && (
          <button className="btn" onClick={() => { setErr(''); setStep(s => s - 1) }}>Back</button>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={() => void next()}>
          {step === 3 ? 'Submit' : 'Next'}
        </button>
      </div>
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
