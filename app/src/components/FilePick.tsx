import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useToast } from './Toast'

/**
 * Pick a file and upload it, with progress, preview and re-upload.
 *
 * Replaces three bare `<input type="file">` in this project (payment receipt, dispute evidence,
 * onboarding documents). Their shared problem: nothing in the UI moves between clicking the button
 * and success -- uploading a photo of a few MB takes several seconds, and during those seconds the
 * user cannot tell whether it is uploading or whether the click missed. The onboarding one even had
 * an empty catch, so a failed upload said nothing at all.
 *
 * The upload itself is "upload on pick", not on form submit: uploading at submit time means the user
 * fills everything in, hits save, and then has to watch an open-ended wait; and a file that turns out
 * to be too large is only discovered after a whole page has been filled in.
 */

type State =
  | { s: 'idle' }
  | { s: 'up'; name: string; pct: number }
  /* url is the signed link the upload came back with. It is separate from ref
     because ref names the file and url is permission to open it — and when the
     component starts from a ref handed in through `value`, there is no url yet
     and no link to show. */
  | { s: 'ok'; name: string; ref: string; url?: string }
  | { s: 'bad'; name: string; why: string }

/*
What a receipt, a piece of evidence or an onboarding document is allowed to be.

Images and PDF, and deliberately nothing else. The list is short because
everything on it has to be openable by the person on the other end — a market
maker checking a bank transfer, a reviewer reading a licence. A .docx or a
.zip uploads perfectly well and then arrives as a download of unknown type in
the middle of a two-hour verification window, which is worse than being told
up front that it will not do.

`accept` on the input is only a filter on the picker: the dialog offers "all
files" and curl ignores it entirely. So it is repeated as a real check below,
and again on the server — three places because they answer three different
questions (what to offer, what to tell you immediately, what to actually
store).
*/
const OK_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
const OK_ACCEPT = OK_TYPES.join(',')
/** The same list as a sentence. Derived, so the words cannot drift from the
    filter the way a hand-written hint does. */
const OK_LABEL = 'JPG, PNG, GIF, WebP or PDF'

/** Does the browser think this file is one of the allowed kinds?
 *
 *  Type first, because it is what the server will decide on. An empty type
 *  (which happens: an unknown extension, some Android pickers) falls through
 *  to the extension rather than being refused — the server sniffs the bytes
 *  and has the final say, and refusing here on a guess would block a real
 *  receipt over a missing MIME string. */
const OK_EXT = /\.(jpe?g|png|gif|webp|pdf)$/i
function allowed(f: File): boolean {
  if (f.type) return OK_TYPES.includes(f.type.toLowerCase())
  return OK_EXT.test(f.name)
}

export default function FilePick({
  onDone,
  value,
  label = 'Attach',
  hint,
  accept = OK_ACCEPT,
  identity,
  className = '',
  variant = 'field',
  disabled = false,
}: {
  /** The file_ref obtained after a successful upload. */
  onDone: (ref: string, meta: { name: string; url?: string }) => void
  /** An already-uploaded file (for prefill). If given, it renders straight away as attached. */
  value?: string
  label?: string
  /** The small line shown when nothing is picked, explaining what to upload. */
  hint?: string
  accept?: string
  identity?: string
  className?: string
  /**
   * 'field': the dashed box inside a form (onboarding documents, dispute evidence).
   * 'button': a primary button in the footer (payment receipt) -- that one is a one-off action,
   *   not a field that has to stay visible, and a dashed box there would stretch the whole footer row.
   */
  variant?: 'field' | 'button'
  /** Disabled in button form (for instance while something else is being submitted outside). */
  disabled?: boolean
}) {
  const [st, setSt] = useState<State>(value ? { s: 'ok', name: short(value), ref: value } : { s: 'idle' })
  const pick = useRef<HTMLInputElement>(null)
  const job = useRef<{ abort: () => void } | null>(null)
  const last = useRef<File | null>(null)
  const { toast } = useToast()

  /* Abort any in-flight upload on unmount. Without that it finishes and then calls setState on a
     component that no longer exists, for a file nobody wants any more. */
  useEffect(() => () => job.current?.abort(), [])

  const send = (f: File) => {
    /* Type first, because it costs nothing to check and the alternative is
       sending sixteen megabytes before being told no. The server checks the
       bytes themselves — this one only saves the trip. */
    if (!allowed(f)) {
      const why = `${OK_LABEL} only — that one is ${f.type || 'a kind we cannot read'}`
      setSt({ s: 'bad', name: f.name, why })
      toast(why, { kind: 'err' })
      return
    }
    /* Check the size locally first. The backend uses io.LimitReader, which truncates silently -- it
       does not error on oversize, it stores a file cut in half. Discovering that when a reviewer
       cannot open it is far too late. */
    if (f.size > ep.MAX_UPLOAD) {
      const why = `That file is ${mb(f.size)}, over the ${mb(ep.MAX_UPLOAD)} limit`
      setSt({ s: 'bad', name: f.name, why })
      toast(why, { kind: 'err' })
      return
    }
    last.current = f
    setSt({ s: 'up', name: f.name, pct: 0 })
    const j = ep.uploadProgress(f, pct => setSt(s => (s.s === 'up' ? { ...s, pct } : s)), identity)
    job.current = j
    j.done.then(u => {
      job.current = null
      setSt({ s: 'ok', name: f.name, ref: u.file_ref, url: u.url })
      /* Hand back what it is, not just the reference. A caller that has to
         show the person what they picked — before doing something with it
         that cannot be taken back — has no way to name the file otherwise. */
      onDone(u.file_ref, { name: f.name, url: u.url })
    }).catch((e: unknown) => {
      job.current = null
      const msg = e instanceof Error ? e.message : 'Upload failed'
      /* A cancellation by the user is not a failure: fall back to the unpicked state, no red text. */
      if (msg === 'Upload cancelled') { setSt({ s: 'idle' }); return }
      setSt({ s: 'bad', name: f.name, why: msg })
      toast(msg, { kind: 'err', action: { label: 'Retry', onClick: () => send(f) } })
    })
  }

  const input = (
    <input type="file" hidden ref={pick} accept={accept}
      onChange={e => {
        const f = e.target.files?.[0]
        /* The value has to be cleared: without it, picking the same file twice in a row fires no
           change event, so re-picking the same file after a failed upload does nothing. */
        e.target.value = ''
        if (f) send(f)
      }} />
  )

  /* Button form: progress is drawn on the button itself (a background layer driven by --pct); that
     footer row has no space for a separate progress bar. Clicking it while uploading cancels. */
  if (variant === 'button') {
    const up = st.s === 'up'
    return (
      <>
        {input}
        {/* className overrides the default emphasis. When this button is the
            one action on the card it is primary; when it sits beside a submit
            it must not compete with it. */}
        <button type="button" disabled={disabled && !up}
          className={'btn ' + (className || 'btn-primary') + ' fpbtn1' + (up ? ' uping' : '')}
          style={up ? ({ ['--pct' as string]: st.pct + '%' } as React.CSSProperties) : undefined}
          /* Say it here too, for anyone who reaches the button by keyboard or
             screen reader rather than by reading the line under it. */
          title={`${OK_LABEL}, up to ${mb(ep.MAX_UPLOAD)}`}
          onClick={() => { if (up) { job.current?.abort(); return } pick.current?.click() }}>
          {up ? `${st.pct}% · Cancel` : label}
        </button>
        {/* The field variant has always carried this line; the button variant
            had nothing, so the one place a bank receipt is attached was also
            the one place that never said what a receipt may be. A rejection
            replaces it, because at that moment the rule matters more than the
            restatement of it. */}
        <span className={'fphint' + (st.s === 'bad' ? ' bad' : '')}>
          {st.s === 'bad' ? st.why : `${OK_LABEL} · up to ${mb(ep.MAX_UPLOAD)}`}
        </span>
      </>
    )
  }

  return (
    <div className={'fpick ' + className}>
      {input}
      <button type="button" className={'sfup fpbtn' + (st.s === 'ok' ? ' ok' : st.s === 'bad' ? ' bad' : '')}
        onClick={() => {
          if (st.s === 'up') { job.current?.abort(); return }
          pick.current?.click()
        }}>
        <span className="fptx">
          <b>{label}</b>
          <em>{st.s === 'idle' ? (hint ?? `${OK_LABEL}, up to ${mb(ep.MAX_UPLOAD)}`)
            : st.s === 'bad' ? st.why : st.name}</em>
        </span>
        <span className="sfst">
          {st.s === 'up' ? `${st.pct}% · Cancel`
            : st.s === 'ok' ? 'Attached'
              : st.s === 'bad' ? 'Try again' : 'Choose'}
        </span>
      </button>

      {/* The progress bar only takes space while uploading. A permanently empty track makes a form at rest look like it is waiting for something. */}
      {st.s === 'up' && (
        <div className="fpbar" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: st.pct + '%' }} />
        </div>
      )}

      {/* What was uploaded has to be openable. Showing "uploaded" alone asks people to trust a file they
          cannot see -- this is already established practice elsewhere (the evidence bundle), and is kept consistent here. */}
      {st.s === 'ok' && st.url && (
        <a className="fplink" href={st.url} target="_blank" rel="noopener">View file</a>
      )}
    </div>
  )
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1) + ' MB'
/** On prefill there is only a ref, no original filename -- use the last segment as the name, which beats showing a long uuid. */
const short = (ref: string) => ref.split('/').pop() ?? ref
