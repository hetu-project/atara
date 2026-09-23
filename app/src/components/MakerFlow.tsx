import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { COUNTRIES } from './countries'
import Dither from './Dither'
import FilePick from './FilePick'
import IdCheck from './IdCheck'
import {
  IDENTITY_FIELDS, KYC_CORP, KYC_IND, LISTING_STEPS, VERIFIED_BIZ, VERIFIED_FIELDS,
  type Field, type Step,
} from './kycforms'
import { ListingStep, badListingField, blankListing, type Listing } from './MakerListing'
import type { KybResult, ReviewIssue } from '../api/types'


/**
 * The onboarding wizard card: nine steps of identity documents, or two steps of trading terms.
 *
 * It is only a form card -- what happens after submission (acknowledgement, under review, approved) is not here
 * but is a handful of messages in the conversation, rendered by MakerThread. The reference splits it the same way:
 * "submitting is not 'the form turning into a status card' but a round of conversation".
 *
 * The card has no close button, and the reference has none either: it is a piece of content inside this
 * conversation, not a dialog laid over it, and closing it would amount to deleting what was just said.
 */
/**
 * Index of the earliest step containing a field the review flagged.
 *
 * Returns 0 when nothing is flagged, so a first submission is unaffected.
 * Field keys the form does not have (a model naming something we never sent,
 * or a stale issue after the form changed) simply match nothing — they must
 * not push the applicant to a step that has no problem on it.
 */
function firstFlaggedStep(
  phase: 'kyc' | 'listing',
  initial: Record<string, unknown> | undefined,
  issues: ReviewIssue[] | undefined,
): number {
  if (phase !== 'kyc' || !issues?.length) return 0
  const want = new Set(issues.flatMap(i => i.fields).filter(k => k !== '*'))
  if (!want.size) return 0
  const steps = (initial?.kind === 'Corporate' ? KYC_CORP : KYC_IND) as Step[]
  const at = steps.findIndex(st => (st.fields ?? []).some(f => want.has(f.k)))
  return at < 0 ? 0 : at
}

export default function MakerFlow({
  phase, identity, initial, issues, draft, draftStep, kyb: initialKyb,
  resubmit, onPending, onSubmitted, onFailed, onBackOut,
}: {
  phase: 'kyc' | 'listing'
  identity: string
  /**
   * These terms have already been approved once and are being changed.
   *
   * Submitting is not a free edit: it drops the approval until the review
   * clears again (PRD, seller sub-flow, re-review on configuration change), and no listing can be posted in
   * between. Opening this form costs nothing, so the warning belongs here on
   * the last step rather than on the button that opens it.
   */
  resubmit?: boolean
  /** Problems raised by the last pre-review. Marked on the offending items rather than dumped as a summary for people to hunt through. */
  issues?: ReviewIssue[]
  /**
   * The copy saved partway through, not yet submitted.
   *
   * Takes precedence over initial: initial is "what was submitted last time", the draft is "what is being filled
   * in now". With both present, the one being filled in is how they left it.
   */
  draft?: Record<string, unknown>
  draftStep?: number
  /** The most recent corporate verification conclusion. Coming back after a refresh relies on it, so nothing has to be re-verified. */
  kyb?: KybResult
  /** What was submitted last time. On a send-back the form reopens carrying the original content -- so they can
      work against the comments rather than refilling nine steps from scratch. Undefined when there was no previous one. */
  initial?: Record<string, unknown>
  /**
   * Fired the moment the request goes out, before anything comes back.
   *
   * The review runs server-side and takes a few seconds (rules are instant,
   * the model is not). Without this the thread has nothing to show for that
   * whole wait: the form just sits there with a dead button.
   */
  onPending?: (phase: 'kyc' | 'listing') => void
  /** Submitted successfully. form is handed back for the acknowledgement -- that "view submission" section is drawn from it. */
  onSubmitted: (phase: 'kyc' | 'listing', form: Record<string, unknown>) => void
  /** Submission failed: the request never landed. Only used to withdraw the "under review" to-do -- the form stays,
      with the error below it. This used to reuse onSubmitted, which closed the form on its way past, taking the error with it. */
  onFailed?: (phase: 'kyc' | 'listing') => void
  /** The return from step one of the trading terms. The reference's arrow goes back to the identity form; here
      identity has already been submitted and that form is gone, so it returns to the conversation -- "not right now" is a real intent and needs somewhere to go. */
  onBackOut?: () => void
}) {
  /* Initial values are unpacked from last time's submission. On submit the kyc section sends { kind, ...form },
     so kind has to be picked out separately and what remains is the form's own fields.
     Lazy initialisation (useState(() => ...)) rather than backfilling in a useEffect: backfilling renders the form
     empty for one frame before jumping to the filled values, and on a nine-step form that jump is very visible. */
  /* Entity type follows the draft first, then last time's submission. The draft is "what is being filled in now",
     and the click they just made on step 1 is in it -- closer to their current intent than an initial that was never submitted. */
  const [kind, setKind] = useState<'Individual' | 'Corporate'>(() => {
    const src = (draft ?? initial) as Record<string, unknown> | undefined
    return src?.kind === 'Corporate' ? 'Corporate' : 'Individual'
  })
  /*
    Open on the step that has the first problem, not on step one.

    The summary sits at the top of the thread and the per-field note sits
    inside the step it belongs to; with a dozen corporate steps between them,
    someone who was sent back to fix two fields can see neither. Moving the summary below
    the form would not help — the distance is the problem, not the side.

    Nothing flagged (a first submission) starts at the beginning as before.
  */
  /* With a draft, return to the step they left on; a sent-back one still jumps to the first offending item --
     the comments point at a particular step, and putting the person somewhere else to read them is useless. */
  const [step, setStep] = useState(() => {
    const flagged = firstFlaggedStep(phase, initial, issues)
    if (flagged > 0) return flagged
    return Math.max(0, draftStep ?? 0)
  })
  const [form, setForm] = useState<Record<string, string | string[]>>(() => {
    if (phase !== 'kyc') return {}
    const src = draft ?? initial
    if (!src) return {}
    const { kind: _k, ...rest } = src
    return rest as Record<string, string | string[]>
  })
  const [lst, setLst] = useState<Listing>(() => {
    const src = phase === 'listing' ? (draft ?? initial) : null
    return src ? { ...blankListing(), ...(src as unknown as Listing) } : blankListing()
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* Stop saving drafts once it has been submitted. The backend already cleared it on submission; saving again here
     would write it back, so the next open restores something different from the documents under review. */
  const [done, setDone] = useState(false)
  /* The corporate verification conclusion. The initial value comes from the application -- coming back after a
     refresh should not cost another 10 credits to re-verify.
     `kybBusy` is only true within this session: it means "waiting on upstream", not a state worth persisting. */
  const [kyb, setKyb] = useState(() => initialKyb)
  const [kybBusy, setKybBusy] = useState(false)
  const kybOk = kyb?.status === 'accept'

  /* Autosave.

     Debounced at 800ms: one request per keystroke means several hundred requests for one pass through a nine-step
     form, and each of those requests has to encrypt once and write to the database once. Saving at the moment
     typing stops is the moment someone has really "finished an item".

     No saving after submission: the draft has been cleared by the backend by then, and saving again writes it back,
     so the next open restores documents different from what was submitted.

     A failed save does not interrupt anyone. It is a convenience, not what they are doing -- popping an error for
     one missed save only breaks up form filling. Without a key configured the backend returns DRAFT_UNAVAILABLE, which is likewise silent. */
  const sent = useRef('')
  useEffect(() => {
    if (busy || done) return
    /* What is saved is the **currently selected** entity type, not the one submitted last time.

       This used to say `kind: initial?.kind` -- someone clicked Corporate on step 1, filled in through step seven,
       and the draft still recorded undefined. Coming back after a refresh it read no entity type, fell back to the
       individual path, and the dozen-odd items already filled in no longer lined up with anything. */
    const body = phase === 'kyc'
      ? { ...form, kind }
      : (lst as unknown as Record<string, unknown>)
    const payload = JSON.stringify(body)
    // Do not save if nothing changed. A changed step counts as a change -- they turned a page.
    const sig = String(step) + ':' + payload
    if (sig === sent.current) return
    const t = setTimeout(() => {
      sent.current = sig
      void ep.saveMakerDraft({ phase, step, form: body }, identity).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [form, lst, step, phase, identity, busy, done, kind])
  /* Which row is wrong. The reference adds .bad to that .sf to reveal its preset .err -- the error is said on the
     offending field, not as a vague line at the bottom of the card. */
  const [bad, setBad] = useState('')

  /* Problems raised by the pre-review, flattened into "field -> what you need to do".

     One objection can point at several fields ("nationality says Hong Kong while tax residency says China" points
     at two), and both have to be marked -- marking only the first leaves the other looking fine, so they fix one,
     resubmit, and are sent back by the same objection again.

     Items that have been edited stop being marked immediately: they have already acted on it, and leaving it red
     says their fix made no difference. So once touched contains this key, it is no longer marked. */
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const flagged = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of issues ?? []) {
      for (const k of i.fields) {
        if (k === '*' || touched.has(k)) continue
        m.set(k, i.ask)
      }
    }
    return m
  }, [issues, touched])

  /* Identity verification status. Only the kyc section needs it -- listing configuration has nothing to do with documents.
     No polling of its own here: IdCheck only starts it spinning once the person has actually opened the flow, and
     before that, asking the backend every few seconds is asking for nothing, while each ask makes the backend pull
     from upstream (billed per call). */
  /* Clear that red line as soon as verification passes.

     Clicking Next before verification finishes -> setBad('sf-idcheck') -> the red line appears. Verification then
     completes in another window, the status is pushed back, the green frame lights up, and the red line is still
     hanging there -- the same control saying both "passed" and "go and pass this first". The red line was a
     judgement about that moment, and when the judgement changes it should go. */
  const { data: kyc, reload: reloadKyc } =
    useApi(() => (phase === 'kyc' ? ep.kycStatus(identity) : Promise.resolve(null)), [identity, phase])

  /* Write the fields read off the document back into the form: after verification these should not be typed again.
     Written into form rather than just substituted at render time, because form is what gets submitted --
     changing only the display would still submit empty values. */
  const verified = useMemo(() => {
    const id = kyc?.state === 'accept' ? kyc.identity : null
    if (!id && !(kind === 'Corporate' && kybOk)) return {}
    /* Option-typed fields have to be asked "is this value one of our options?" first. DocuPass recognises far more
       countries and document types than this table lists -- forcing in a value that is not in the list yields
       either a row showing a value that cannot be selected, or one silently rewritten to "Other". */
    const opts = new Map<string, string[] | undefined>()
    const fields = [
      ...((kind === 'Corporate' ? KYC_CORP : KYC_IND) as Step[]).flatMap(st => st.fields ?? []),
      /* The individual path has no step for the identity fields any more;
         their option lists still decide what the document may write in. */
      ...IDENTITY_FIELDS,
    ]
    for (const f of fields) {
      if (f.type === 'pick' || f.type === 'multi') opts.set(f.k, f.opts)
    }
    const out: Record<string, string> = {}
    const take = (map: Record<string, string>, src: Record<string, unknown> | undefined) => {
      if (!src) return
      for (const [k, from] of Object.entries(map)) {
        const v = src[from]
        if (typeof v !== 'string' || !v) continue
        if (opts.has(k) && !(opts.get(k) ?? []).includes(v)) continue
        out[k] = v
      }
    }
    take(VERIFIED_FIELDS, id as unknown as Record<string, unknown>)
    /* The corporate path likewise: company details read off the registration document should not be typed again.
       Only a verified one counts -- data from a review / reject conclusion is itself in doubt, and using it to lock
       inputs turns a questionable conclusion into an unchangeable fact. */
    if (kind === 'Corporate' && kybOk) {
      take(VERIFIED_BIZ, kyb?.business as unknown as Record<string, unknown>)
    }
    return out
  }, [kyc, kind, kyb, kybOk])

  useEffect(() => {
    if (!Object.keys(verified).length) return
    setForm(f => ({ ...verified, ...f, ...verified }))
  }, [verified])

  /* The list of directors is carried over from the verification result.

     /kyb's directorsToVerify is the authoritative answer to "which natural persons need verifying", far better than
     having someone type it out again -- a hand-typed list has been checked by nobody, and checking is the whole
     reason this step exists.

     Only filled while this column is still empty: once they have added rows themselves, overwriting wipes out what
     they entered. Nationality and document number still have to be supplied by them; neither is on the document. */
  useEffect(() => {
    const names = kybOk ? (kyb?.business.directors ?? []) : []
    if (!names.length) return
    setForm(f => {
      const cur = Array.isArray(f.dirs) ? f.dirs : []
      if (cur.length) return f
      return { ...f, dirs: names.map(n => ({ name: n })) as unknown as string[] }
    })
  }, [kyb, kybOk])

  /* Verify as soon as the upload finishes, without another click.

     Not placed in FilePick's onDone: that layer only knows "the file uploaded", while this depends on whether it is
     a registration document and whether this particular one has already been verified. `sentDoc` remembers the one
     that was verified, and only a different one triggers another -- at 10 credits a go, re-verifying the same one burns money.

     The initial value comes from the backend's existing conclusion rather than an empty string. A ref only lives
     for this mount: one refresh and it has forgotten what was verified, while the draft's bizdoc is still there,
     so another request goes out. In testing this burned 30 credits. The server now blocks it too (reusing a
     conclusion by user_id + file_ref), but that round trip never needed to be made -- what it knows is knowable here as well. */
  const sentDoc = useRef(initialKyb?.file_ref ?? '')
  useEffect(() => {
    if (kind !== 'Corporate') return
    const ref = typeof form.bizdoc === 'string' ? form.bizdoc : ''
    if (!ref || ref === sentDoc.current) return
    sentDoc.current = ref
    setKybBusy(true)
    ep.verifyBusiness(ref, identity)
      .then(setKyb)
      .catch((e: unknown) => {
        /* A failed verification is not silent. It cost money and time, and the person is waiting on this step's
           conclusion -- saying nothing only makes them think the UI has hung, and then upload again. */
        setErr(e instanceof Error ? e.message : 'Could not verify that document')
        sentDoc.current = ''
      })
      .finally(() => setKybBusy(false))
  }, [form.bizdoc, kind, identity])

  useEffect(() => {
    if (kyc?.state === 'accept') setBad(b => (b === 'sf-idcheck' ? '' : b))
  }, [kyc?.state])

  const steps: Step[] = phase === 'kyc'
    ? (kind === 'Corporate' ? KYC_CORP : KYC_IND)
    : LISTING_STEPS.map(s => ({ ...s, fields: [] }))
  const cur = steps[step]
  const last = step === steps.length - 1

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  /** The identity section: missing items, date formats. Returns the id of the offending field. */
  const badKyc = (): string => {
    for (const f of cur?.fields ?? []) {
      /* Whether the verification step passed is the backend's call. Having the frontend record "I clicked it" and
         release on that hands the key to this door to anyone who opens a console. */
      if (f.type === 'idcheck') {
        if (kyc?.state !== 'accept') return 'sf-' + f.k
        continue
      }
      const v = form[f.k]
      /* Optional items pass when left blank.

         The frontend used to treat every item as required, stricter than the backend -- something like "province",
         which does not exist at all in Hong Kong, Singapore or the Cayman Islands, had to be filled in, and once
         filled was flagged in review as duplicating the city.
         The authority on what is required is the backend, and this follows it. */
      if (f.opt && !(Array.isArray(v) ? v.length : v)) continue
      /* A group of people: at least one row, with every column of every row filled. An empty row is worse than no
         row -- it looks like a declaration while saying nothing. */
      if (f.type === 'list') {
        const rows = (Array.isArray(v) ? v : []) as unknown as Record<string, string>[]
        if (!rows.length) return 'sf-' + f.k
        const hole = rows.some(r => (f.row ?? []).some(sub => !String(r?.[sub.k] ?? '').trim()))
        if (hole) return 'sf-' + f.k
        continue
      }
      const empty = f.type === 'multi' ? !(Array.isArray(v) && v.length) : !v
      if (empty) return 'sf-' + f.k
      if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) return 'sf-' + f.k
    }
    return ''
  }

  const next = async () => {
    const b = phase === 'kyc' ? badKyc() : badListingField(lst, step)
    if (b) { setBad(b); return }
    setBad(''); setErr('')
    if (!last) { go(step + 1); return }
    setBusy(true)
    try {
      const payload = phase === 'kyc'
        ? { kind, ...form }
        : { ...lst } as unknown as Record<string, unknown>
      // Tell the thread we are waiting *before* awaiting, not after it lands.
      onPending?.(phase)
      /* Stop autosaving before the request goes out, not after. The submit
         clears the draft server-side; a save that was already queued would
         land afterwards and put it back. */
      setDone(true)
      await ep.submitMakerApp(phase, payload, identity)
      onSubmitted(phase, payload)
    } catch (e) {
      // It did not land, so there is still something worth keeping.
      setDone(false)
      setErr(e instanceof Error ? e.message : 'Could not submit')
      /* The request failed, so nothing is in flight any more. Leaving the
         thread on "checking…" would have it wait forever on a reply that
         is never coming. Only the pending marker comes off: the form stays
         open with the error under its button. (This used to call
         onSubmitted, whose other job is to close the form — so the error
         above was set on a component that vanished in the same tick.) */
      onFailed?.(phase)
    } finally { setBusy(false) }
  }

  const tag = phase === 'kyc'
    ? (kind === 'Corporate' ? 'Business verification' : 'Identity verification')
    : 'Trading terms'
  const kindLine = kind + (form.surname
    ? ' · ' + String(form.surname) + String(form.firstname ?? '')
    : form.company ? ' · ' + String(form.company) : '')

  /* Per-step state for both renderings of the progress: the rail and the
     narrow bar draw the same list, so it is computed once.

     Every step that can be reached is a button. The review points at step 4
     and step 9 while the person stands on step 12; walking Back and Next
     through the whole form is a dozen clicks, each one re-running that step's
     validation. Backwards only, never forward past a step not yet filled —
     the checks run step by step, and skipping one is skipping its check.
     Flagged steps are the exception: they were submitted, and going straight
     to them is the point. */
  const rail = steps.map((s2, i) => {
    const needs = (s2.fields ?? []).some(f => flagged.has(f.k))
    return {
      t: s2.t, i, needs,
      can: i <= step || needs,
      cls: [i < step ? 'on' : i === step ? 'now' : '', needs ? 'todo' : ''].filter(Boolean).join(' '),
    }
  })
  /* A step change is drawn as: this step leaves (fast), the next one arrives
     (slower), moving in the direction of travel. Leaving needs the old content
     to stay on screen for its 110ms, so the state change is held back that long;
     validation has already run by the time go() is called, so nothing the person
     did is delayed — only what they see. Reduced motion: change at once. */
  const [dir, setDir] = useState<1 | -1>(1)
  const [leaving, setLeaving] = useState(false)
  const goTimer = useRef<number | null>(null)
  useEffect(() => () => { if (goTimer.current) clearTimeout(goTimer.current) }, [])
  const go = (i: number) => {
    if (i === step) return
    setDir(i > step ? 1 : -1)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setStep(i); return }
    if (goTimer.current) clearTimeout(goTimer.current)
    setLeaving(true)
    goTimer.current = window.setTimeout(() => {
      goTimer.current = null
      setLeaving(false)
      setStep(i)
    }, 110)
  }
  const jump = (i: number) => { setBad(''); setErr(''); go(i) }
  const flaggedSteps = rail.filter(r => r.needs && r.i !== step).map(r => r.i + 1)
  const nextStep = steps[step + 1]

  /* One deal card in the thread, not a modal, as in the reference's paintMaker().

     Two columns: every step named down the left, the current step on the
     right. The old segmented bar hid the step names behind hover, so nobody
     knew what was still to come until they got there — the point in a long
     form where people give up (corporate onboarding is twelve steps). The
     rail lays the whole route out, and a step the review bounced says so in
     words, where the bar could only turn a two-pixel segment amber.

     The rail costs width. Below 640px of card (the chat column with the
     assessment panel dragged wide, or a phone) it folds away and a bar at
     the top of the body takes over — thicker than the old one, with a line
     under it carrying what the rail would have said. One React tree, one
     container query; see .krail / .kbar. */
  return (
    <div className="deal mine xopen kyc">
      <div className="open"><div className="openin">
        {/* The whole card morphs when the route changes — Individual has two
            steps, Corporate twelve, and the rail below goes from one to the
            other in a single render. Without this the card doubles in height
            in one frame and the thread under it jumps. StepStage inside does
            the same for the content on a step change; the two never fire on
            the same render. */}
        <HeightMorph dep={kind + phase} className="kwrap">
          {phase === 'kyc' && (
            /* Keyed on kind so the list remounts when the route changes and
               every item plays its entrance, staggered by --i: the route reads
               as unrolling rather than being swapped. Items that leave are not
               animated out — ten fading at once would drag — the height morph
               above carries that side. */
            <nav className="krail" aria-label="Steps" key={kind}>
              {rail.map(r => (
                <button key={r.t} type="button" className={'kst ' + r.cls}
                  style={{ '--i': Math.min(r.i, 10) } as React.CSSProperties}
                  disabled={!r.can || busy}
                  aria-current={r.i === step ? 'step' : undefined}
                  onClick={() => jump(r.i)}>
                  <span className="kdot" aria-hidden>
                    {r.needs ? '!' : r.i < step ? (
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5 6.2 11.7 13 4.9" /></svg>
                    ) : r.i + 1}
                  </span>
                  <span className="kt">{r.t}{r.needs && <em>Needs a change</em>}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="kbody">
            <div className="keye">
              <span>{tag}</span><i aria-hidden>·</i>
              <span>Step {step + 1} of {steps.length}</span>
            </div>
            <h3 className="kh">{cur?.t}</h3>
            {/* The narrow-width bar. Same states as the rail; what the rail said
                in words goes on one line under it. */}
            <div className="kbar" aria-label={`Step ${step + 1} of ${steps.length}`}>
              <div>
                {rail.map(r => (
                  <button key={r.t} type="button" className={r.cls} disabled={!r.can || busy}
                    title={`${r.i + 1}. ${r.t}`} aria-label={`${r.i + 1}. ${r.t}`}
                    onClick={() => jump(r.i)}><i /></button>
                ))}
              </div>
              <p>
                {nextStep ? <>Next: <b>{nextStep.t}</b></> : <>Last step</>}
                {flaggedSteps.length > 0 && (
                  <> · Step {flaggedSteps.join(', ')} need{flaggedSteps.length === 1 ? 's' : ''} a change</>
                )}
              </p>
            </div>
            <StepStage step={step} dir={dir} leaving={leaving}>
            <p className="sellm-lead">{cur?.lead}</p>

          {phase === 'listing' ? (
            <ListingStep d={lst} step={step} bad={bad} kindLine={kindLine}
              identity={identity} onChange={setLst} />
          ) : (
            <>
              {/* Step one picks the entity type: the fields on the two paths that follow are entirely different */}
              {step === 0 && (
                <div className="sf"><span className="sfl">Account type</span>
                  <div className="sfchips">
                    {(['Individual', 'Corporate'] as const).map(k => (
                      <button key={k} type="button" className={'sfchip' + (kind === k ? ' on' : '')}
                        /* Switching entity type clears the form: the two paths' fields are entirely different, and
                           what was filled on the previous path would bleed into same-named fields on this one. But
                           the items read off the document were not "filled in" -- clearing those turns the next step
                           back into a row of empty boxes to be typed by hand. */
                        /* Clear the form outright. `verified` is memoised on the
                           kind that is *about to change*, so spreading it here put
                           the outgoing kind's verified fields — a company's, say —
                           into the incoming kind's form. The effect on `verified`
                           re-applies the right set once kind has actually changed. */
                        onClick={() => { setKind(k); setForm({}) }}>{k}</button>
                    ))}
                  </div>
                </div>
              )}
              {(cur?.fields ?? []).map(f => (
                f.type === 'idcheck' ? (
                  /* Whether this step passed is not recorded in the form, so there is no FieldRow .err to use.
                     Without adding a line, Next is a dead button: no response, and no reason given. */
                  <div key={f.k} className={'sf' + (bad === 'sf-' + f.k ? ' bad' : '')}>
                    <IdCheck identity={identity} status={kyc ?? null} onDone={reloadKyc} />
                    <span className="err">{errFor(f)}</span>
                  </div>
                ) : (
                  <FieldRow key={f.k} f={f} v={form[f.k]} bad={bad === 'sf-' + f.k}
                    identity={identity}
                    after={f.k === 'bizdoc'
                      ? <KybNote r={kyb} busy={kybBusy} /> : undefined}
                    locked={f.k in verified}
                    flagged={flagged.get(f.k)}
                    onSet={v => {
                      setBad('')
                      /* Edited items stop being marked red -- they are already working on it. */
                      if (flagged.has(f.k)) {
                        setTouched(t => new Set(t).add(f.k))
                      }
                      set(f.k, v)
                    }} />
                )
              ))}
            </>
          )}

          {last && resubmit && !err ? (
            <p className="dnote" style={{ color: 'var(--warn)' }}>
              Submitting sends these terms back for review. Your current terms stay
              approved until then, but you cannot post new listings while it runs.
            </p>
          ) : null}
          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
            </StepStage>

            {/* Back on the left, forward on the right, on a rule of their own at
                the bottom of the column. Back is always drawn so the two never
                swap places between steps; on the first step it is simply off. */}
            <div className="kfoot">
              <button type="button" className="btn btn-ghost"
                disabled={busy || !(step > 0 || (phase === 'listing' && onBackOut))}
                onClick={() => {
                  setBad(''); setErr('')
                  if (step > 0) go(step - 1)
                  else onBackOut?.()
                }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 3 5 8l5 5" /></svg>
                Back
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void next()}>
                {/* Say what it is doing. A button that only greys out looks
                    broken when the wait runs into seconds. */}
                {busy && <Dither size={12} speed={1} label="Checking" />}
                {busy ? 'Checking…' : !last ? 'Next' : resubmit ? 'Resubmit for review' : 'Submit'}
                {!busy && !last && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 3 5 5-5 5" /></svg>
                )}
              </button>
            </div>
          </div>
        </HeightMorph>
      </div></div>
    </div>
  )
}

/**
 * A box that transitions its height whenever `dep` changes, by measuring
 * itself before and after. The same measure-and-tween StepStage uses for the
 * step content, without the content animation: here the children are the
 * card's two columns and only the outline should move. Reduced motion: the
 * height simply changes.
 */
function HeightMorph({
  dep, className, children,
}: { dep: string; className?: string; children: React.ReactNode }) {
  const wrap = useHeightMorph(dep)
  return <div ref={wrap} className={className}>{children}</div>
}

/**
 * The area of the card that changes between steps, and how it changes.
 *
 * Two motions at once. The content: the old step fades, lifts 5px and blurs
 * on its way out (`.kstage.out`, 110ms); the new one fades in from 8px below,
 * blurred, and settles (`.kin`, 220ms). Going back reverses the direction —
 * `--kdir` flips the signs. The blur is what makes it read as one thing
 * changing rather than two things swapping: without it there is a frame where
 * both are legible at once. Same recipe as beUI's tab panels; nothing new.
 *
 * The height: the stage measures itself before and after the content changes
 * and transitions between the two, the way StepSlide does in WalletModals. Without
 * this the chat stream below the card jumps every time a step has a different
 * number of fields — and every step does.
 *
 * `key={step}` remounts the inner wrapper so the enter animation plays once
 * per step. Keyframes, not a transition, because it runs from a fresh mount and
 * is never interrupted mid-way: the exit is finished before it starts.
 */
function StepStage({
  step, dir, leaving, children,
}: { step: number; dir: 1 | -1; leaving: boolean; children: React.ReactNode }) {
  const wrap = useHeightMorph(step)
  return (
    <div ref={wrap} className={'kstage' + (leaving ? ' out' : '')}
      style={{ '--kdir': dir } as React.CSSProperties}>
      <div key={step} className="kin">{children}</div>
    </div>
  )
}

/**
 * Transition an element's height whenever `dep` changes: measure before,
 * measure after, tween between. Used by StepStage (per step) and HeightMorph
 * (per route).
 *
 * Two effects, on purpose. The first has no deps and only takes a reading each
 * render, so the "before" height is always the latest. The second runs only
 * when `dep` changes and owns the tween. They used to be one depless effect,
 * and that was the bug: the tween sets the old height, then waits a frame to
 * set the new one — and any re-render in between (switching account type
 * triggers one straight away, from the verified-fields write-back) ran the
 * cleanup, cancelled that frame, and left the box pinned at the old height
 * with nothing left to unpin it. The card stayed Corporate-tall after
 * switching back to Individual.
 *
 * The cleanup now also clears the inline styles itself, and a timer clears
 * them if transitionend never arrives (it can be skipped when the transition
 * is interrupted). Reduced motion: the height just changes.
 */
function useHeightMorph(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const fromH = useRef(0)
  const prev = useRef(dep)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && prev.current === dep) fromH.current = el.offsetHeight
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prev.current === dep) return
    prev.current = dep
    const from = fromH.current
    /* Read the natural height with nothing pinned: a previous tween that was
       cut short may have left its inline height on the element. */
    el.style.height = ''
    el.style.overflow = ''
    el.style.transition = ''
    const to = el.offsetHeight
    fromH.current = to
    if (!from || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const clear = () => {
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
      el.removeEventListener('transitionend', done)
      clearTimeout(guard)
    }
    const done = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'height') clear()
    }
    el.style.height = `${from}px`
    el.style.overflow = 'hidden'
    const id = requestAnimationFrame(() => {
      el.style.transition = 'height var(--dur-normal) var(--ease)'
      el.style.height = `${to}px`
    })
    el.addEventListener('transitionend', done)
    const guard = window.setTimeout(clear, 600)
    return () => { cancelAnimationFrame(id); clear() }
  }, [dep])

  return ref
}

/* Error wording follows the control type. Not lowercased: that would mangle abbreviations like ID / TIN. Taken verbatim from the reference. */
const VERB: Record<string, string> = {
  text: 'Enter', date: 'Enter', pick: 'Select', multi: 'Select', sign: 'Sign',
  country: 'Select', upload: 'Upload', list: 'Add at least one',
}
const errFor = (f: Field) =>
  f.type === 'sign' ? 'Signature required'
    : f.type === 'idcheck' ? 'Finish the identity check first'
      : `${VERB[f.type] ?? 'Enter'} ${f.l}`

/**
 * The corporate verification conclusion, hung under the registration document item.
 *
 * The three levels say three different things and are not merged into one "pass/fail":
 *   accept  -- read successfully; the boxes on the next step will be locked
 *   review  -- read, but with doubts; a human will look
 *   reject  -- this document does not hold up; supply another
 *
 * The simulated line has to be prominent: a machine running simulated verification and one running real
 * verification are indistinguishable in the UI apart from this sentence.
 */
function KybNote({ r, busy }: { r?: KybResult; busy: boolean }) {
  if (busy) {
    /* The house loader (Dither) beside the sentence. A line of grey text on
       its own does not move, and a wait of several seconds with nothing
       moving reads as a hang. */
    return (
      <span className="kbn busy">
        <Dither size={16} speed={1.1} label="Reading your document" />
        Reading your document — this takes a few seconds…
      </span>
    )
  }
  if (!r) return null
  const b = r.business
  const tone = r.status === 'accept' ? 'ok' : r.status === 'review' ? 'warn' : 'bad'
  return (
    <div className={'kbn ' + tone}>
      <b>
        {r.status === 'accept' ? '✓ Business verified'
          : r.status === 'review' ? 'Needs a closer look'
            : '✕ Could not verify this document'}
      </b>
      {b.legal_name && (
        <span className="kbb">
          {b.legal_name}
          {b.reg_number ? ` · ${b.reg_number}` : ''}
          {b.status ? ` · ${b.status}` : ''}
        </span>
      )}
      {r.warnings?.length ? (
        <ul className="kbw">
          {r.warnings.map(w => <li key={w.code}>{w.description}</li>)}
        </ul>
      ) : null}
      {r.simulated && (
        <span className="kbs">Simulated — nothing was actually verified.</span>
      )}
    </div>
  )
}

/**
 * Searchable country/region.
 *
 * Follows the same approach as BankBox in BankAccounts, but **without the free-text escape hatch** -- the
 * difference lies in the nature of the table: the bank table exists to save typing, and stopping a user entering
 * their actual bank is a bug; the country table is the full set of ISO 3166-1, and something not in it is not a country.
 *
 * The value is the two-letter code and the display is the name. Storing names means a rename like "Macedonia"
 * leaves historical data no longer lining up, whereas codes go unchanged for decades.
 */
function CountryBox({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', away)
    return () => removeEventListener('pointerdown', away)
  }, [])

  const term = q.trim().toLowerCase()
  /* Codes take part in matching too: someone who knows they want GB should not be forced to spell out United Kingdom.
     An empty query gives the first eight rather than all 241 -- a list that takes more than a screen to scroll is no list at all. */
  const hits = Object.entries(COUNTRIES)
    .filter(([c, n]) => !term || n.toLowerCase().includes(term) || c.toLowerCase() === term)
    .slice(0, 8)

  return (
    <div className="cbox" ref={box}>
      <input type="text" role="combobox" aria-expanded={open} autoComplete="off"
        placeholder="Type to search — Hong Kong, BVI, GB…"
        value={open ? q : (COUNTRIES[value] ?? '')}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); setOpen(true) }} />
      <div className="cblist" role="listbox" hidden={!open || !hits.length}>
        {hits.map(([c, n]) => (
          <button type="button" className="cbrow" key={c} role="option"
            onPointerDown={e => { e.preventDefault(); onPick(c); setOpen(false) }}>
            <span className="cbn">{n}</span>
            <span className="cbc">{c}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The small "optional" marker.
 *
 * Only optional is marked, never required: the vast majority of this form is required, and starring the majority
 * is starring the whole page, when what people actually need to know is which few can be skipped.
 */
function Opt({ f }: { f: Field }) {
  return f.opt ? <em className="sfopt">optional</em> : null
}

function FieldRow({
  f, v, bad, locked, flagged, identity, after, onSet,
}: {
  f: Field; v: string | string[] | undefined; bad: boolean
  /** The upload kind needs this to send the file. */
  identity?: string
  /** Things hung under the control, such as a verification conclusion. */
  after?: React.ReactNode
  /** This item was read off the document. Locked against editing -- edited, it is no longer the person on the document. */
  locked?: boolean
  /** What the pre-review said about this item. When set, mark it and place the message below. */
  flagged?: string
  onSet: (v: string | string[]) => void
}) {
  const cls = 'sf' + (bad ? ' bad' : '') + (locked ? ' vfd' : '')
    + (flagged ? ' flagged' : '')

  /* Verified items always render as a single read-only reading, whatever control they would otherwise be.
     Leaving them as editable inputs means letting someone change the verified name and then submit --
     the documents no longer match the identity document while the UI still says "verified". */
  if (locked) {
    /* A country read off a document is stored as a code, but what people see has to be the name. */
    const shown = f.type === 'country' && typeof v === 'string'
      ? (COUNTRIES[v] ?? v) : v
    return (
      <div className={cls} data-flag={flagged}>
        <span className="sfl">{f.l}<Opt f={f} /></span>
        <div className="sfvfd">
          <b>{Array.isArray(shown) ? shown.join(', ') : shown}</b>
          <em>from your document</em>
        </div>
      </div>
    )
  }
  if (f.type === 'pick') {
    return (
      <div className={cls} data-flag={flagged}><span className="sfl">{f.l}<Opt f={f} /></span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (v === o ? ' on' : '')}
              onClick={() => onSet(o)}>{o}</button>
          ))}
        </div>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  if (f.type === 'multi') {
    const arr = Array.isArray(v) ? v : []
    return (
      <div className={cls} data-flag={flagged}><span className="sfl">{f.l}<Opt f={f} /></span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (arr.includes(o) ? ' on' : '')}
              onClick={() => onSet(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])}>{o}</button>
          ))}
        </div>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  /* Signature and upload are each one wide row (.sfup), with the label inside the button and no separate .sfl
     outside -- that is what the reference does: these two are not "pick one of several options" but "do one thing",
     and made into small chips they would look identical to the multi-select chips beside them, leaving the reader unable to tell which is an action. */
  /* One file. The value stored is the backend's file_ref -- the file itself is in the uploads table with a sha256,
     so "is this still the same document as the original?" can be answered after the fact. */
  /* Searchable country.

     241 territories do not fit into a row of chips, and scrolling a dropdown to the 180th to find "British Virgin
     Islands" is not a choice either. Type-to-filter is the only workable form at this length.

     The value stores the ISO code and the display is the name: codes are stable, while names change with language
     and with the year (the "Macedonia" rename left plenty of systems' historical data no longer lining up). */
  if (f.type === 'country') {
    return (
      <div className={cls} data-flag={flagged}>
        <span className="sfl">{f.l}<Opt f={f} /></span>
        <CountryBox value={typeof v === 'string' ? v : ''} onPick={onSet} />
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }

  if (f.type === 'upload') {
    return (
      <div className={cls} data-flag={flagged}>
        <FilePick label={f.l} hint={f.hint} identity={identity}
          value={typeof v === 'string' ? v : undefined}
          onDone={(ref: string) => onSet(ref)} />
        {after}
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }

  /* A group of repeating rows: directors, beneficial owners.

     Each group used to be three or four single fields, which structurally only fit one person -- a company with
     five directors could not declare truthfully on that form, and "declare your directors truthfully" is the whole
     reason this step exists.

     Every column within a row is **rendered recursively by FieldRow itself**, with no second set of controls. The
     first version hand-rolled a horizontal row of inputs and a <select>, when this form has never had a select --
     nationality has always been chips. Two kinds of control on one page make people assume it is a different kind
     of thing. With recursion, what it looks like here is always what it looks like everywhere else. */
  if (f.type === 'list') {
    const rows: Record<string, string>[] = Array.isArray(v)
      ? (v as unknown as Record<string, string>[]) : []
    const put = (next: Record<string, string>[]) => onSet(next as unknown as string[])
    const label = f.l.replace(/s$/, '')
    return (
      <div className={cls} data-flag={flagged}>
        <div className="lsrows">
          {rows.map((row, i) => (
            <div className="lsrow" key={i}>
              <div className="lshd">
                <span>{label} {i + 1}</span>
                {/* Deletable even with only one row -- deleting them all and adding one back beats forcing an empty row to stay. */}
                <button type="button" className="lsx" aria-label={`Remove ${label} ${i + 1}`}
                  onClick={() => put(rows.filter((_, j) => j !== i))}>×</button>
              </div>
              {(f.row ?? []).map(sub => (
                <FieldRow key={sub.k} f={sub} v={row[sub.k]} bad={false}
                  onSet={val => put(rows.map((r, j) =>
                    j === i ? { ...r, [sub.k]: val as string } : r))} />
              ))}
            </div>
          ))}
          <button type="button" className="lsadd"
            onClick={() => put([...rows, {}])}>+ Add {label.toLowerCase()}</button>
        </div>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }

  if (f.type === 'sign') {
    return (
      <div className={cls} data-flag={flagged}>
        <button type="button" className={'sfup' + (v ? ' ok' : '')}
          onClick={() => onSet(v ? '' : 'Signed')}>
          <span><b>{f.l}</b><em>{typeof v === 'string' && v ? v : 'Tap to sign'}</em></span>
          <span className="sfst">{v ? 'Signed' : 'Sign'}</span>
        </button>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  /* Dates do not use a native <input type="date">: it renders in the browser's language, so on a Chinese system it
     shows localised date parts, which does not match this all-English interface. The reference uses a plain text
     box plus a YYYY-MM-DD placeholder, with the format validated here. */
  const isDate = f.type === 'date'
  return (
    <div className={cls} data-flag={flagged}><span className="sfl">{f.l}<Opt f={f} /></span>
      <input type="text" value={typeof v === 'string' ? v : ''}
        placeholder={isDate ? 'YYYY-MM-DD' : 'Enter'}
        inputMode={isDate ? 'numeric' : undefined}
        onChange={e => onSet(e.target.value)} autoComplete="off" spellCheck={false} />
      <span className="err">{isDate ? `${f.l} must be YYYY-MM-DD` : errFor(f)}</span>
    </div>
  )
}
