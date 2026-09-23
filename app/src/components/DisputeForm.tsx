import { useState } from 'react'
import * as ep from '../api/endpoints'
import FilePick from './FilePick'

/**
 * Opens a dispute case. Two steps: explain what is about to happen, then fill the form.
 *
 * A form is a form, not a conversation -- hence a modal, so the user stays in the thread
 * where the problem happened. The reference splits it the same way: the first screen is a
 * single line ("funds stay locked, we will get back to you once we have looked") plus one
 * button; the second screen is the category, the account and the evidence.
 *
 * Everything entered is sent to the backend and stored in this order's event stream. Without
 * that, the UI would look like a successful submission while every word the user wrote hit
 * the floor -- worse than not offering the form at all.
 */
const KINDS = [
  'They say they did not receive it',
  'Amount does not match',
  'Paid to the wrong account',
  'Goods or service not as agreed',
  'Something else',
]

export default function DisputeForm({
  orderId, ref_, who, amount, identity, onClose, onDone,
}: {
  orderId: string
  /** Ticket number. The case file follows it, and it is what the user quotes when reporting a problem. */
  ref_: string
  who: string
  amount: string
  identity: string
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<'why' | 'form'>('why')
  const [kind, setKind] = useState(KINDS[0]!)
  const [text, setText] = useState('')
  const [file, setFile] = useState('')
  const [bad, setBad] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!text.trim()) { setBad(true); return }
    setBusy(true); setErr('')
    try {
      await ep.dispute(orderId, { kind, details: text.trim(), file_ref: file || undefined }, identity)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the case')
    } finally { setBusy(false) }
  }

  const head = (
    <header className="mhead">
      <h3>Open a dispute</h3>
      <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>
    </header>
  )

  if (step === 'why') {
    return (
      <div id="modal" role="dialog" aria-modal="true"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="mcard msq">{head}<div className="mbody">
          <div className="sqi">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3.4 2.6 20h18.8Z" /><path d="M12 9.6v4.2" />
              <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <p className="acnote">
            Funds stay locked while we look at it. You describe what happened, we review
            the record, and reply by email — usually within one business day.
          </p>
          <div className="dfoot">
            <button className="btn btn-primary" onClick={() => setStep('form')}>Open a case →</button>
          </div>
        </div></div>
      </div>
    )
  }

  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">{head}<div className="mbody">
        <p className="acnote">{ref_} · {who} · {amount}</p>
        <p className="acnote">
          The order record, the escrow history and anything you upload go with the case.
        </p>

        <div className="sf"><span className="sfl">What went wrong</span>
          <div className="sfchips">
            {KINDS.map(k => (
              <button key={k} type="button" className={'sfchip' + (kind === k ? ' on' : '')}
                onClick={() => setKind(k)}>{k}</button>
            ))}
          </div>
        </div>

        <div className={'sf' + (bad ? ' bad' : '')}><span className="sfl">Details</span>
          <input type="text" value={text} autoComplete="off" autoFocus
            placeholder="What happened, and when"
            onChange={e => { setText(e.target.value); setBad(false) }} />
          <span className="err">Tell us what happened</span>
        </div>

        <div className="sf">
          <FilePick label="Evidence (optional)" identity={identity} value={file || undefined}
            hint="Bank receipt, screenshot, chat export"
            onDone={ref => { setFile(ref); setErr('') }} />
        </div>

        {err ? <p className="acnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
        <div className="dfoot">
          <button className="btn btn-primary" disabled={busy}
            onClick={() => void submit()}>{busy ? 'Submitting…' : 'Submit case'}</button>
        </div>
      </div></div>
    </div>
  )
}
