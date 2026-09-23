import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as ep from '../api/endpoints'
import Dither from './Dither'
import Qr from './Qr'
import type { KycSession, KycStatus } from '../api/types'

/**
 * The identity verification step: hand the person over to ID Analyzer's hosted DocuPass flow.
 *
 * Photographing the document, front and back, and the face liveness check all happen on their side, and the
 * images never pass through us. This step used to be three upload boxes (ID front / ID back / Liveness check) --
 * which is not verification, it is collecting images: anyone could upload three casual snapshots, with no step
 * anywhere checking that the document was real or that the face on it was theirs. Next to the upload boxes there
 * was even a "Demo fill" that filled the entire application with fakes in one click.
 *
 * -- The browser side does not get to decide --
 *
 * All that can be obtained here is the reference (short-lived, single use). The API key stays on the backend --
 * ID Analyzer's own documentation states this as a hard rule. The callback fired when the flow ends is likewise
 * only a UI signal that "the user clicked through": anyone with a console open can type "I finished" by hand. So
 * this component claims no conclusion when it is done; it simply asks the backend for kycStatus -- the copy the
 * backend settled from a signed callback or an active pull.
 */

/* Their official lightbox (v.idanalyzer.com/js/docupassembed.js) is not used.
   Two reasons:

   One, it is buggy. The whole script is wrapped in document.addEventListener('DOMContentLoaded', ...) and
   window.DocupassEmbed is only assigned inside that event. It assumes you write the <script> statically into
   <head>; we inject it when a button is clicked, by which time DOMContentLoaded is long past, so the listener
   never runs and the global stays undefined.

   Two, it should not be used even without the bug. Making it work means mounting that third-party script
   statically on every page -- and this page also carries the user's wallet. Trading whole-site DOM access for a
   3.8KB lightbox is a bad deal -- all it does is create a div wrapping an iframe, which is forty lines written ourselves.

   The DocuPass side sends no X-Frame-Options and no CSP frame-ancestors, so it can be embedded directly.
   Their documentation says as much: "you may use any lightbox plugin that supports iframes". */

export default function IdCheck({
  identity, status, onDone,
}: {
  identity: string
  /** The current status. Fetched by the layer above; this component does not idle-poll on its own. */
  status: KycStatus | null
  /** The status may have changed -- ask the layer above to fetch again. */
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* This session. Only set while the dialog is open -- closing it does not invalidate the session, since the
     person may have switched to their phone to scan the code and finish there, with that session still running. */
  const [sess, setSess] = useState<KycSession | null>(null)
  /* Whether the window for that session is showing. Closing the window used to
     drop the session with it, so a slip of the hand left "Start over" as the
     only way back — a new upstream session for a check that was half done. Now
     closing hides the window and the session stays; the person can reopen it,
     and Start over is what it says. */
  const [open, setOpen] = useState(false)
  /* Only poll while an unfinished verification is outstanding.
     Never started (state 'none') means do not ask: asking the backend every few seconds then is pointless, and
     each ask makes the backend pull from upstream -- which is billed per call.
     Conversely, already pending on arrival must be asked about: the person may have taken the photos on their
     phone and come back to this page, with the flow having finished outside this tab. */
  const [watching, setWatching] = useState(status?.state === 'pending')
  const timer = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null }
  }, [])

  useEffect(() => {
    if (!watching) return
    /* Photographing on their side takes over a minute, so asking more often is pointless.
       Ask for a while and then stop: stopping wedges nothing -- reopening this step fetches again. */
    let left = 60 // ~5 minutes
    timer.current = setInterval(() => {
      if (left-- <= 0) { stop(); setWatching(false); return }
      onDone()
    }, 5000) as unknown as number
    return stop
  }, [watching, onDone, stop])

  /* Follow the status as soon as it arrives: with a conclusion, stop asking; still outstanding, keep asking. */
  useEffect(() => {
    if (!status) return
    if (status.state === 'pending') setWatching(true)
    else if (status.state !== 'none') { stop(); setWatching(false); setSess(null); setOpen(false) }
  }, [status, stop])

  const start = async () => {
    setBusy(true); setErr('')
    try {
      const s = await ep.startKyc(identity)
      setSess(s)
      setOpen(true)
      setWatching(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not start verification')
    } finally {
      setBusy(false)
    }
  }

  if (status && !status.configured) {
    /* Say it truthfully. A button that does nothing, or pretending it passed, are both lying to whoever is operating it. */
    return (
      <div className="sfnote">
        Identity verification is not configured on this server. Ask an operator to set
        <code> IDANALYZER_API_KEY</code>.
      </div>
    )
  }

  const st = status?.state ?? 'none'
  const sim = !!status?.simulated

  if (st === 'accept') return <Verified status={status!} />

  if (st === 'reject') {
    return (
      <div className="idck">
        <Banner tone="bad" title="Verification did not pass"
          note="The checks below did not clear. You can try again with a different document." />
        <Warnings status={status} />
        <button className="btn btn-secondary" disabled={busy} onClick={() => void start()}>
          {busy && <Dither size={12} speed={1} label="Opening" />}
          {busy ? 'Opening…' : 'Try again'}
        </button>
      </div>
    )
  }

  /* The backend's sentence takes precedence over our generic one.

     The generic one says "a check did not pass", while the most common reason for a downgrade to review is that
     **every check passed** -- this document is already under another account. Reading the generic one, people go
     and rephotograph the document, and no number of retakes will help. When there is a reason, give the reason. */
  if (st === 'review') {
    return (
      <div className="idck">
        <Banner tone="warn" title="Sent for manual review"
          note={status?.note ||
            'Your documents were read, but at least one check needs a person to look at it. You will be able to trade once it clears.'} />
        <Warnings status={status} />
      </div>
    )
  }

  return (
    <div className="idck">
      {/* In simulated mode, say it up front: this step verifies nothing.
          Above the button rather than below it -- an explanation is only useful if it is read before the action. */}
      {sim ? (
        <Banner tone="warn" title="Identity checks are switched off on this server"
          note="Nothing will be verified — this passes the step with a placeholder document. Local development only." />
      ) : (
        <p className="sfnote">
          {st === 'pending'
            ? 'Verification is in progress. Finish it in the window that opened, or start over.'
            : 'Photograph your ID and take a short selfie. The capture runs on ID Analyzer — your images do not pass through Atara.'}
        </p>
      )}
      {/* After completion this does not say "passed" -- that sentence is the backend's to say.
          Simulated mode has no "awaiting result": the backend settled a conclusion on the spot. */}
      {/* Polling for a verdict that may take a minute. The loader says the
          wait is alive; the sentence says what it is waiting for. */}
      {watching && !sim && (
        <p className="sfnote kwait">
          <Dither size={14} speed={1.1} label="Waiting for the result" />
          Waiting for the result…
        </p>
      )}
      {sess?.url && !open && st === 'pending' ? (
        /* The window was closed on a session that is still open. Reopening is
           the usual want; starting over is the deliberate one, so it is the
           quiet button. */
        <div className="idacts">
          <button className="btn btn-primary" onClick={() => setOpen(true)}>Reopen the window</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void start()}>
            {busy && <Dither size={12} speed={1} label="Opening" />}
            {busy ? 'Opening…' : 'Start over'}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={busy} onClick={() => void start()}>
          {busy && <Dither size={12} speed={1} label="Opening" />}
          {busy ? 'Opening…'
            : sim ? 'Skip verification'
              : st === 'pending' ? 'Start over' : 'Verify my identity'}
        </button>
      )}
      {err ? <p className="sfnote bad">{err}</p> : null}
      {/* A simulated session has no URL, so what pops up is a blank page. */}
      {sess?.url && open && <DocuPassSheet sess={sess} onClose={() => setOpen(false)} />}
    </div>
  )
}

/**
 * The DocuPass flow, embedded in our own dialog.
 *
 * Two paths offered side by side: if the machine in front of you has a camera, shoot straight into the frame; if
 * not (most desktops), scan the code below and use a phone. The QR code comes from ID Analyzer together with the
 * session and is not one we drew ourselves -- it points at the same session, and finishing on a phone lights this side up too.
 */
/* Mounted on <body>, not where it is rendered from.

   It is rendered from inside the verification card, and that card is a CSS
   container (`container-type` on .deal.kyc .openin, for the rail that folds
   away when the card is narrow). A container applies layout containment, and
   layout containment makes the element the containing block for fixed-position
   descendants — so a fixed overlay inside it is no longer fixed to the viewport,
   it is pinned inside the card and clipped by its overflow. A portal takes the
   overlay out of that subtree; the modal was never conceptually part of the
   card anyway. */
function DocuPassSheet({ sess, onClose }: { sess: KycSession; onClose: () => void }) {
  return createPortal(
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard dpcard">
        <header className="mhead">
          <h3>Verify your identity</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody dpbody">
          {/* The allow attribute is essential: camera permission has to be explicitly delegated to the embedded
              origin, and without it the browser rejects DocuPass's stream request outright -- while all it shows
              is "cannot open the camera", giving no sign that we were the ones blocking it. */}
          <iframe className="dpframe" src={sess.url} title="Identity verification"
            allow="camera; microphone; fullscreen" />
          <div className="dpside">
            {/* The code is generated by us from this link rather than the one ID Analyzer supplies with the session.
                Theirs encodes the original link without ?l= -- scanned on a phone, the interface follows the phone's
                system language, so the screen is in one language and the phone in another for the same verification.
                Incidentally this one is an SVG while theirs is a JPEG (a lossy format, for a QR code). */}
            <Qr text={sess.url} size={158} />
            <p className="sfnote">
              No camera on this machine? Scan the code — it opens the same session on your phone.
            </p>
            <a className="btn btn-secondary btn-sm" href={sess.url}
              target="_blank" rel="noreferrer noopener">Open in a new tab</a>
            <p className="sfnote">
              Leave this open — the result lands here on its own when you finish.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** After passing, show the fields read off the document -- the user does not have to type them again. */
function Verified({ status }: { status: KycStatus }) {
  const id = status.identity
  /* A simulated "passed" has to carry its label onwards, not just say so at the moment of clicking.
     This card is the one that stays visible afterwards -- marked here, its provenance is clear whenever it is read. */
  const sim = !!status.simulated
  const name = [id?.first_name, id?.last_name].filter(Boolean).join(' ') || id?.full_name
  const rows: [string, string | undefined][] = [
    ['Name', name],
    ['Date of birth', id?.dob],
    ['Document', [id?.doc_type, id?.doc_number].filter(Boolean).join(' · ') || undefined],
    ['Expires', id?.expiry],
    ['Nationality', id?.nationality],
  ]
  return (
    <div className="idck">
      {sim ? (
        <Banner tone="warn" title="Simulated — nothing was verified"
          note="Identity checks are switched off on this server (ATARA_KYC=false)." />
      ) : null}
      <Banner tone="ok" title="Identity verified"
        note="Read from your document — nothing here was typed in." />
      <div className="idkv">
        {rows.filter(([, v]) => !!v).map(([k, v]) => (
          <div className="afc" key={k}><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
      {/* Passing with reservations does happen (low-severity warnings do not block release).
          Not blocking does not mean not worth saying -- it is on the record for this verification. */}
      <Warnings status={status} />
    </div>
  )
}

function Warnings({ status }: { status: KycStatus | null }) {
  const w = status?.warnings ?? []
  if (!w.length) return null
  return (
    <ul className="idwarn">
      {w.map(x => (
        <li key={x.code}><b>{x.code}</b> — {x.description}</li>
      ))}
    </ul>
  )
}

function Banner({ tone, title, note }: { tone: 'ok' | 'warn' | 'bad'; title: string; note: string }) {
  return (
    <div className={'idbn ' + tone}>
      <b>{title}</b>
      <em>{note}</em>
    </div>
  )
}
