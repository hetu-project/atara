import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Dither from './Dither'
import Fold from './Fold'
import MakerFlow from './MakerFlow'
import MakerOffer, { OfferPosted } from './MakerOffer'
import { FIELD_LABELS, IDENTITY_FIELDS, KYC_CORP, KYC_IND } from './kycforms'
import { listingRows, type Listing } from './MakerListing'
import { go } from '../hooks/useRoute'
import type { MakerApp, Offer } from '../api/types'

/**
 * Onboarding is a conversation, not a status card that changes face.
 *
 * The reference is blunt about it: "this is a conversation product; submitting is not 'the form turning into a
 * status card' but a round of conversation -- you send an application (expandable to see what was submitted), the
 * platform acknowledges, and once review passes it replies with a message carrying the next step." So every step
 * onwards here appends a message to #log, and everything said before stays:
 *
 *   [card: nine-step form] -> [me: Submitted identity verification]
 *   -> [platform: Received — ... (expandable to 25 submitted items)]
 *   -> [platform: ✓ Identity verified. Next: ... "Set up trading terms →"]
 *   -> [card: two-step terms] -> [me: Submitted trading terms] -> ...
 *
 * The messages are derived from backend state rather than remembered by this component: refresh the page and the
 * conversation is still there, where the reference loses everything on refresh. Release is on the backend too
 * (5 seconds after submission), so "under review" becoming "approved" is pushed from there and this only paints it.
 */

// -- Messages -----------------------------------------------------------

const Me = ({ children }: { children: React.ReactNode }) => (
  <div className="msg me"><span className="bub">{children}</span></div>
)

/*
  Three dots, the chat idiom for "the other side is composing".

  Written in CSS rather than pulled from a motion library: the animation is
  one keyframe and three delays, while the library it comes from wants
  framer-motion, Next and Tailwind — none of which this app has. Borrowing
  the idea is free; borrowing the dependency is not.
*/
const Dots = () => (
  <span className="tdots" aria-hidden><i /><i /><i /></span>
)

/* The platform's acknowledgements are also "the other side" speaking: they carry Atara's square mark, distinct from a person's round avatar. */
const Them = ({ children, typing }: { children: React.ReactNode; typing?: boolean }) => (
  <div className={'msg them' + (typing ? ' typing' : '')}>
    <span className="mrow">
      <span className="mav deskav" aria-hidden><i /></span>
      <span className="bub">{children}</span>
    </span>
  </div>
)

// -- The "view submission" section inside an acknowledgement ------------

type Group = [string, [string, string][]]

const show = (v: unknown) => {
  if (Array.isArray(v)) return v.join(' · ')
  if (typeof v === 'boolean') return v ? 'Yes' : '—'
  const s = v == null ? '' : String(v)
  return s || '—'
}

/**
 * Identity documents expand into every field, grouped by step -- the record has to be complete, not a three-line summary.
 *
 * The verification step is not in it: it is not a value filled into a form, and whether it passed lives in
 * kyc_verifications. Without filtering it out, the acknowledgement gains a stray "Identity verification —" row
 * that looks like an unfilled item.
 */
function kycGroups(form: Record<string, unknown>): Group[] {
  const corp = form.kind === 'Corporate'
  const steps = corp ? KYC_CORP : KYC_IND
  const groups = steps
    .map(st => [st.t, (st.fields ?? [])
      .filter(f => f.type !== 'idcheck')
      .map(f => [f.l, show(form[f.k])] as [string, string])] as Group)
    .filter(([, rows]) => rows.length)
  /* Individuals type nothing after the identity check, so the receipt would be
     one line ("Account type"). What the document said is the submission; it
     goes on the receipt under its own heading, only the fields that came back. */
  if (!corp) {
    const rows = IDENTITY_FIELDS
      .filter(f => form[f.k] !== undefined && form[f.k] !== '')
      .map(f => [f.l, show(form[f.k])] as [string, string])
    if (rows.length) groups.push(['From your document', rows])
  }
  return groups
}

/* The living part of a "Received" receipt.

   Between "submitted" and "approved" the thread used to go still: nothing on
   screen moved until the verdict bubble appeared, and with the demo timing
   note gone there is no hint that anything is happening. This line says the
   system is working without promising when it will finish — a pulsing dot
   and the time of the last poll, not a spinner or a countdown. In production
   this stage can sit for hours under human review; a dot and a clock are still
   true after hours, a progress bar is not. Reuses .fstat from the deposit
   watcher so the two "waiting on something" surfaces read the same. */
function ReviewLine({ state, checkedAt }: {
  state: 'review' | 'ok' | 'back'; checkedAt: number
}) {
  const text = state === 'ok' ? 'Approved' : state === 'back' ? 'Sent back — see below' : 'Under review'
  const when = checkedAt > 0
    ? new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''
  return (
    <span className={'fstat rline ' + state} role="status">
      <i />
      <span><b>{text}</b>
        {when && <em className="fchk">{state === 'ok' ? 'Cleared ' : 'Checked '}{when}</em>}
      </span>
    </span>
  )
}

function Receipt({ groups }: { groups: Group[] }) {
  const n = groups.reduce((a, [, rows]) => a + rows.length, 0)
  return (
    <Fold className="rcpt" summary={`View submission · ${n} fields`}>
      {groups.map(([t, rows]) => (
        <div className="rgrp" key={t}>
          <em>{t}</em>
          <dl className="sfsum">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      ))}
    </Fold>
  )
}

/** The backend stores the two submissions separately as {"kyc":...,"listing":...}. If it will not parse, treat it as absent. */
function forms(raw: string | undefined): { kyc?: Record<string, unknown>; listing?: Listing } {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

/**
 * Sent back for changes.
 *
 * It is not "you were rejected" -- the wording, the colour and what follows all have to make that clear: once it
 * has been said, the form lays itself out again below with the previous answers in it. A final rejection has no
 * sequel, a send-back does; looking identical on screen, people will only read it as the former.
 */
function Revise({
  reason, app, identity, onDone,
}: {
  reason: string
  app: MakerApp | null
  identity: string
  onDone: () => void
}) {
  /* Appealing is a **secondary** exit, so it is collapsed by default: the vast majority of send-backs really do
     have something to fix, and giving "I think you got it wrong" the same prominence as "go and fix it" makes
     people reach for the easier one first. */
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const appealed = !!app?.appeal_note
  const issues = (app?.review_issues ?? []).filter(i => !i.fields.includes('*'))

  const send = async () => {
    const b = note.trim()
    if (!b || busy) return
    setBusy(true); setErr('')
    try {
      await ep.appealMakerApp(b, identity)
      setOpen(false); setNote(''); onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send that')
    } finally { setBusy(false) }
  }

  return (
    <Them>
      {/*
        Framed as a record, not as a remark.

        It used to be an ordinary chat bubble — same avatar, same background,
        same shape as the assistant making conversation. But this is a
        decision that stops the application, so it has to read like one:
        what it is, how many things it found, and who found them.
      */}
      <div className="mkverd">
        <div className="mkvh">
          <span className="mkvt">Review</span>
          <span className="mkvn">
            {issues.length ? `${issues.length} to change` : 'Needs a change'}
          </span>
        </div>

        {issues.length ? (
          <ol className="mkvl">
            {issues.map((it, n) => (
              <li key={n}>
                {/* Name the fields it is about. A verdict you cannot trace
                    back to a field is one you cannot check. */}
                <span className="mkvf">{it.fields.map(labelOf).join(' · ')}</span>
                <p className="mkvs">{it.says}</p>
                <p className="mkva">{it.ask}</p>
              </li>
            ))}
          </ol>
        ) : (
          // Older records kept only the joined summary; still show it.
          <p className="mkvs">{reason}</p>
        )}

        {/* Attribution. A decision that blocks someone must say who made it —
            without it a machine's call is indistinguishable from small talk. */}
        <div className="mkvby">
          {app?.review_source === 'ai'
            ? `Checked by Atara AI${app.review_model ? ` · ${app.review_model}` : ''}`
            : app?.review_source === 'human' ? 'Reviewed by a person'
              : 'Checked against the listing rules'}
          {app?.reviewed_at ? ` · ${clockOf(app.reviewed_at)}` : ''}
        </div>
      </div>

      <span className="mkrevf">Your answers are still below — edit and send again.</span>
      {/* No second button once an appeal has been filed: resubmitting the same thing only adds identical entries
          to the queue, and does not get them seen any sooner. */}
      {appealed ? (
        <span className="mkrevf">We have your note — a person will look at this.</span>
      ) : open ? (
        <span className="mkapp">
          <textarea rows={3} value={note} autoFocus
            placeholder="What do you think we got wrong?"
            onChange={e => setNote(e.target.value)} />
          <span className="mkappb">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()}
              onClick={() => void send()}>{busy ? 'Sending…' : 'Send to a person'}</button>
          </span>
          {err ? <em className="mkapperr">{err}</em> : null}
        </span>
      ) : (
        <button className="mkapplink" type="button" onClick={() => setOpen(true)}>
          I think this is wrong
        </button>
      )}
    </Them>
  )
}

/** Field key → the label on the form. Unknown keys print as-is rather than vanish. */
const labelOf = (k: string) => FIELD_LABELS[k] ?? k

const clockOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(+d) ? '' : d.toTimeString().slice(0, 5)
}

/**
 * Which section was sent back. Empty when none was.
 *
 * reject_reason is a single column shared by both sections -- which is unambiguous, because "submitted but not
 * passed" can only apply to one of them at a time: without identity approval the listing configuration cannot be
 * submitted at all (the backend blocks it).
 */
export function reviseAt(app: MakerApp | null): '' | 'kyc' | 'listing' {
  if (!app?.reject_reason) return ''
  if (app.kyc_done && !app.kyc_ok) return 'kyc'
  if (app.listing_done && !app.approved) return 'listing'
  return ''
}

// -- Main ---------------------------------------------------------------

export default function MakerThread({
  app, identity, from, toListing, toOffer, setToListing, setToOffer, onDone,
}: {
  app: MakerApp | null
  identity: string
  /** Where this came from: wanting to place an order first (trade) or coming straight to onboard (maker). Decides what is said after approval. */
  from: 'trade' | 'maker'
  /* Whether each of the two form sections is open. The state is held by KycProvider: the to-do strip above the
     input and this button here act on the same thing, and separate copies produce "the form is already open while
     the to-do strip is still nagging".
     The form only lays out once the user clicks "Set up trading terms →"; the approval message carries the entry
     point to the next section rather than expanding automatically -- the reference requires a click too. */
  toListing: boolean
  toOffer: boolean
  setToListing: (v: boolean) => void
  setToOffer: (v: boolean) => void
  onDone: () => void
}) {
  /*
    Which stage is waiting on the server right now.

    This used to be a 1.2s timer started *after* the reply came back — it
    simulated a delay that had already happened, while the real wait (rules
    plus a model call, a few seconds) showed nothing at all. Now it covers
    the actual request: set when it goes out, cleared when it lands.
  */
  const [pending, setPending] = useState<'kyc' | 'listing' | null>(null)
  /* Listings that went out. Leaving them in the conversation is the record of that listing -- the reference's
     offerPosted also swaps that card for an acknowledgement rather than clearing it. */
  const [posted, setPosted] = useState<{ o: Offer; sym: string }[]>([])
  const bottom = useRef<HTMLDivElement>(null)

  const f = forms(app?.form)
  /* When the application was last read from the server. The gate polls every
     1.5 s while a review is open and reloads on the live event, and each
     reload hands down a fresh object — so this ticks exactly when the poll
     does, and stops when it stops. That is the point: the clock answers "is
     it still checking", and a clock that kept ticking on its own would not. */
  const [checkedAt, setCheckedAt] = useState(0)
  useEffect(() => { if (app) setCheckedAt(Date.now()) }, [app])
  const kycDone = !!app?.kyc_done
  const kycOk = !!app?.kyc_ok
  const listDone = !!app?.listing_done
  const approved = !!app?.approved
  const revise = reviseAt(app)
  /* The receipt prints the limits with their currency, and which currency
     that is depends on the rails they picked. */
  const { data: accts } = useApi(() => ep.bankAccounts(identity), [identity])

  /* Scroll to the bottom whenever a new message arrives -- without it, the approval message and its button are both off screen. */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [kycDone, kycOk, listDone, approved, pending, toListing, toOffer, posted.length])

  const submitted = (phase: 'kyc' | 'listing') => {
    setPending(cur => (cur === phase ? null : cur))
    /* Close the form once it has been handed in.

       toListing is what "they asked to edit the terms" means, and nothing
       cleared it on the way out — so after a successful resubmission the
       thread showed the receipt and the approval above a form still sitting
       on its confirm step, asking to be submitted again. Whether the review
       passes or bounces is the thread's answer to give, not the form's. */
    if (phase === 'listing') setToListing(false)
    onDone()
  }

  /* When the form card is present: identity documents not yet submitted; the section that was sent back; identity
     passed, the next section clicked but not yet submitted; both passed and a listing clicked.

     The section that was sent back does not wait for another click on "go and fix it" -- the comments are in the
     message right above, so let them work against those comments; inserting another click is just extra ceremony. */
  const card: 'kyc' | 'listing' | 'offer' | null =
    revise ? revise
      /* Terms stay editable after approval. The gate used to be
         `!listDone`, which meant that once they were in, they were fixed:
         a maker who picked the wrong network or typed the wrong limit had
         nowhere to go, and neither did one whose business simply changed.
         Reopening sends the terms back for review — see
         SubmitMakerApplication. */
      : kycOk && toListing ? 'listing'
        : !kycDone ? 'kyc'
          : approved && toOffer ? 'offer'
            : null

  return (
    <>
      {/* Render as soon as it is in flight, not only once it has landed:
          the applicant's own message should appear the moment they hit
          Submit, the same as in any chat. */}
      {(kycDone || pending === 'kyc') && (
        <>
          <Me>Submitted identity verification</Me>
          {pending === 'kyc'
            ? <Them typing><Dots />Reading your answers…</Them>
            : (
              <Them>
                Received — your identity application is under review. Usually cleared within
                one business day.
                {f.kyc ? <Receipt groups={kycGroups(f.kyc)} /> : null}
                <ReviewLine state={kycOk ? 'ok' : revise === 'kyc' ? 'back' : 'review'}
                  checkedAt={checkedAt} />
              </Them>
            )}
        </>
      )}

      {/* Hide the previous verdict while re-review is in progress.

          It says "the last version you submitted has these two things to fix". The person has already fixed them
          and resubmitted and is waiting to hear the result, and leaving the old comments there only makes them
          think the fixes did nothing -- when those two points may genuinely no longer hold. Show it again once the
          new verdict comes back, and what is shown is then certainly the current judgement. */}
      {revise === 'kyc' && pending !== 'kyc'
        ? <Revise reason={app?.reject_reason ?? ''} app={app} identity={identity} onDone={onDone} />
        : null}

      {kycOk && (from === 'trade' || kycDone) && (
        /* Both approval sentences are taken verbatim from the reference: someone verifying in order to place an
           order is only told "you can trade now", and only someone onboarding directly gets the next section.

           The onboarding one also requires kycDone: a passed document check only establishes that this is a real
           person, not that the nine steps of documentation were submitted -- nationality, tax residency and source
           of funds are things DocuPass never asked about. Reading kycOk alone, finishing the liveness check would
           announce "identity approved, next configure your trading terms" and skip the whole self-declaration.
           Someone verifying to place an order does not see this section, so from==='trade' is unchanged. */
        <Them>
          {from === 'trade'
            ? '✓ Identity verified — you can trade now.'
            : <>
                ✓ Identity verified. Next: configure what you sell — assets, limits, pricing
                and payment rails.
                {!listDone && !toListing && (
                  <span className="rgo">
                    <button className="btn btn-primary btn-sm" onClick={() => setToListing(true)}>
                      Set up trading terms →
                    </button>
                  </span>
                )}
              </>}
        </Them>
      )}

      {(listDone || pending === 'listing') && (
        <>
          <Me>Submitted trading terms</Me>
          {pending === 'listing'
            ? <Them typing><Dots />Reading your terms…</Them>
            : (
              <Them>
                Received — your trading terms are under review. Usually cleared within one
                business day.
                {f.listing
                  ? <Receipt groups={[['Trading terms', listingRows(f.listing, accts ?? [])]]} />
                  : null}
                <ReviewLine state={approved ? 'ok' : revise === 'listing' ? 'back' : 'review'}
                  checkedAt={checkedAt} />
              </Them>
            )}
        </>
      )}

      {revise === 'listing' && pending !== 'listing'
        ? <Revise reason={app?.reject_reason ?? ''} app={app} identity={identity} onDone={onDone} />
        : null}

      {approved && (
        <Them>
          ✓ Terms approved — you can post listings now. A listing is one offer with an amount
          and a price; posting it locks those coins into the escrow contract.
          {!toOffer && !posted.length && (
            <span className="rgo">
              <button className="btn btn-primary btn-sm" onClick={() => setToOffer(true)}>
                Post your first listing →
              </button>
            </span>
          )}
        </Them>
      )}

      {posted.map(p => (
        <OfferPosted key={p.o.id} o={p.o} sym={p.sym} onGo={() => go({ view: 'discover' })} />
      ))}

      {card === 'offer' ? (
        <MakerOffer terms={f.listing} identity={identity}
          onEditTerms={() => { setToOffer(false); setToListing(true) }}
          /* Refetch the application after posting: posting a listing changes account state (coins locked into the
             contract), and elsewhere in this conversation the pre-posting copy is still on display. */
          onPosted={(o, sym) => {
            setToOffer(false); setPosted(ps => [...ps, { o, sym }]); onDone()
          }} />
      ) : card && !app ? (
        /* Lay nothing out until the application has come back.

           The gating is derived from a handful of booleans on app, and when app is null they are all false
           -- so "identity documents not yet submitted" is permanently true in the absence of data, and the form
           lays itself out once in its default state first: individual, step 1, empty. By the time the data
           arrives, useState's initialiser has long since run, and the draft and the chosen entity type can no
           longer be put back in.

           The backend returns an object even for someone with no application, so null can only mean "still loading". */
        <div className="mkempty kload">
          <Dither size={20} speed={1.1} label="Loading your application" />
          Loading your application…
        </div>
      ) : card ? (
        <MakerFlow phase={card} identity={identity}
          initial={card === 'kyc' ? f.kyc : (f.listing as unknown as Record<string, unknown>)}
          issues={app?.review_issues}
          /* Only a draft from the same section is restored. The two forms' fields are entirely different, and
             pushing the identity section's content into the trading terms form is far worse than not restoring. */
          draft={app?.draft_phase === card ? app.draft : undefined}
          draftStep={app?.draft_phase === card ? app.draft_step : 0}
          kyb={app?.kyb}
          resubmit={card === 'listing' && listDone}
          onPending={setPending}
          onSubmitted={submitted}
          /* Failure only clears the "checking…" marker. The form stays put
             with its error; closing it is what a successful hand-in earns. */
          onFailed={p => setPending(cur => (cur === p ? null : cur))}
          onBackOut={() => setToListing(false)} />
      ) : null}
      <div ref={bottom} />
    </>
  )
}
