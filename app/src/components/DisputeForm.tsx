import { useState } from 'react'
import * as ep from '../api/endpoints'
import FilePick from './FilePick'

/**
 * 开一张争议案卷。两步：先说清楚会发生什么，再填表。
 *
 * 表是表，不是一段对话——所以走模态，人留在出事的那条线程里填完。参照也是
 * 这么分的：第一屏只有一句「钱会一直锁着，我们看完回复你」和一颗按钮，
 * 第二屏才是分类、经过和凭据。
 *
 * 填的东西全部发给后端存进这一单的事件流。不存的话，界面上它看起来提交成功了，
 * 而用户写的每一个字都落到了地上——那比不给这个表单更糟。
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
  /** 工单号。案卷跟着它走，用户报问题时报的就是这个号。 */
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
