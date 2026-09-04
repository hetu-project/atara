import { useState } from 'react'
import * as ep from '../api/endpoints'
import { KYC_CORP, KYC_IND, LISTING_STEPS, type Field, type Step } from './kycforms'
import type { MakerApp } from '../api/types'

/* 挂单配置的字段。经营配置是能力级的——它圈定以后每次挂单的可选范围，
   所以在这里定一次，不是每次挂单重填。 */
const LISTING_FIELDS: Field[][] = [
  [
    { k: 'dir', l: 'Direction', type: 'pick', opts: ['Buy', 'Sell', 'Both'] },
    { k: 'coins', l: 'Assets', type: 'multi', opts: ['USDT', 'USDC'] },
    { k: 'fiats', l: 'Settlement currencies', type: 'multi', opts: ['CNY', 'HKD', 'USD'] },
    { k: 'lo', l: 'Minimum per order', type: 'text' },
    { k: 'hi', l: 'Maximum per order', type: 'text' },
    { k: 'spread', l: 'Spread %', type: 'text' },
  ],
  [{ k: 'agree', l: 'I accept the maker terms', type: 'sign' }],
]

/**
 * 做市准入：两段提交，两次真人审核。
 *
 *   身份 →【审核】→ 挂单配置 →【审核】→ 可挂单
 *
 * 审核不算 agent 共识，是真人动作——所以中间那两道门系统不会自动放行。
 * KYC 是账户级的，审过一次就不再重做；挂单配置是能力级的，改经营范围才重提。
 */
export default function MakerFlow({
  app, identity, onClose, onDone,
}: {
  app: MakerApp | null
  identity: string
  onClose: () => void
  onDone: () => void
}) {
  const phase: 'kyc' | 'listing' = app?.kyc_ok ? 'listing' : 'kyc'
  const [kind, setKind] = useState<'Individual' | 'Corporate'>('Individual')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Record<string, string | string[]>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const steps: Step[] = phase === 'kyc'
    ? (kind === 'Corporate' ? KYC_CORP : KYC_IND)
    : LISTING_STEPS.map((s, i) => ({ ...s, fields: LISTING_FIELDS[i] ?? [] }))
  const cur = steps[step]
  const last = step === steps.length - 1

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  /* 必填就是必填：缺一项就不让进下一步，并把话说在那一项上，不弹窗。 */
  const missing = (cur?.fields ?? []).filter(f => {
    const v = form[f.k]
    return f.type === 'multi' ? !(Array.isArray(v) && v.length) : !v
  })

  const next = async () => {
    if (missing.length) { setErr(`${missing[0]!.l} is required`); return }
    setErr('')
    if (!last) { setStep(s => s + 1); return }
    setBusy(true)
    try {
      await ep.submitMakerApp(phase, { kind, ...form }, identity)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit')
    } finally { setBusy(false) }
  }

  // 审核中：不许重复提交，把状态说清楚
  const reviewing = (app?.kyc_done && !app.kyc_ok) || (app?.listing_done && !app.approved)
  if (reviewing) {
    return (
      <Sheet onClose={onClose} title="Application in review">
        <p className="acnote">
          Your application is with the reviewer — usually cleared within one business day.
          {app?.reject_reason ? <><br /><b>Returned:</b> {app.reject_reason}</> : null}
        </p>
        <div className="dfoot"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}
      title={phase === 'kyc' ? 'Verify your identity' : 'What you trade'}>
      <ol className="wsteps">
        {steps.map((s, i) => (
          <li key={s.t} className={i < step ? 'done' : i === step ? 'on' : ''}>{s.t}</li>
        ))}
      </ol>

      <h4 style={{ margin: '14px 0 2px' }}>{cur?.t}</h4>
      <p className="acnote">{cur?.lead}</p>

      {/* 第一步选主体类型：之后两条路的字段完全不同 */}
      {phase === 'kyc' && step === 0 && (
        <div className="sfchips">
          {(['Individual', 'Corporate'] as const).map(k => (
            <button key={k} type="button" className={'sfchip' + (kind === k ? ' on' : '')}
              onClick={() => { setKind(k); setForm({}) }}>{k}</button>
          ))}
        </div>
      )}

      {(cur?.fields ?? []).map(f => <FieldRow key={f.k} f={f} v={form[f.k]} onSet={v => set(f.k, v)} />)}

      {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

      <div className="dfoot">
        {step > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }}
            onClick={() => { setErr(''); setStep(s => s - 1) }}>Back</button>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={() => void next()}>
          {last ? 'Submit for review' : 'Next'}
        </button>
      </div>
    </Sheet>
  )
}

function FieldRow({
  f, v, onSet,
}: { f: Field; v: string | string[] | undefined; onSet: (v: string | string[]) => void }) {
  if (f.type === 'pick') {
    return (
      <div className="sf"><span className="sfl">{f.l}</span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (v === o ? ' on' : '')}
              onClick={() => onSet(o)}>{o}</button>
          ))}
        </div>
      </div>
    )
  }
  if (f.type === 'multi') {
    const arr = Array.isArray(v) ? v : []
    return (
      <div className="sf"><span className="sfl">{f.l}</span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (arr.includes(o) ? ' on' : '')}
              onClick={() => onSet(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])}>{o}</button>
          ))}
        </div>
      </div>
    )
  }
  if (f.type === 'sign') {
    return (
      <div className="sf"><span className="sfl">{f.l}</span>
        <button type="button" className={'sfchip' + (v ? ' on' : '')}
          onClick={() => onSet(v ? '' : 'signed')}>
          {v ? '✓ Signed' : 'Sign'}
        </button>
      </div>
    )
  }
  if (f.type === 'upload') {
    return (
      <div className="sf"><span className="sfl">{f.l}</span>
        <label className="sfchip" style={{ cursor: 'pointer' }}>
          {v ? '✓ Attached' : 'Choose file'}
          <input type="file" hidden accept="image/*,application/pdf"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              // 真上传：审核员要看到的是文件，不是一个占位字符串
              try { onSet(await ep.upload(file)) } catch { /* 失败就保持未附 */ }
            }} />
        </label>
      </div>
    )
  }
  return (
    <div className="sf"><span className="sfl">{f.l}</span>
      <input type={f.type === 'date' ? 'date' : 'text'} value={typeof v === 'string' ? v : ''}
        onChange={e => onSet(e.target.value)} autoComplete="off" spellCheck={false} />
    </div>
  )
}

function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div id="modal" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
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
