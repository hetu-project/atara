import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as ep from '../api/endpoints'
import MakerThread from '../components/MakerThread'
import type { MakerApp } from '../api/types'
import { LIVE_EVENT, type LivePayload } from '../api/events'
import { useApi } from './useApi'
import { go } from './useRoute'

interface Ctx {
  /** Returns true when the caller was blocked: stop what you were doing, the door will open by itself. */
  require: () => boolean
  /** Open the onboarding conversation. With an intent, lay that section's form out straight away. */
  openMaker: (intent?: 'listing' | 'offer') => void
  /** Collapse the onboarding conversation, back to the "what would you like to settle" line. The sidebar's New order uses this. */
  closeMaker: () => void
  /** Whether the identity has been reviewed. The account page has to show this truthfully rather than hardcoding "verified". */
  kycOk: boolean
  /** Documents submitted but review not finished -- these two states are not the same thing in the UI. */
  kycPending: boolean
  /**
   * The whole application. For places that need the listing section (the onboarding CTA's copy).
   * If each place fetched it again, some would update after approval and others would not -- and with
   * nobody polling, that copy would sit on "under review" forever. */
  app: MakerApp | null
  /**
   * The onboarding wizard card. In the reference it is not a modal but a card inside the Atara AI
   * conversation (console.html's paintMaker), so the home page renders it into the conversation area
   * rather than covering the screen with an overlay here.
   */
  maker: React.ReactNode | null
}
const KycCtx = createContext<Ctx>({
  require: () => false, openMaker: () => {}, closeMaker: () => {},
  kycOk: false, kycPending: false, app: null, maker: null,
})
export const useKycGate = () => useContext(KycCtx)

/**
 * The identity door before the first trade.
 *
 * Why buyers have to verify too: the fiat leg of OTC goes peer to peer through banks, so the payer has to be
 * an identifiable person -- this is not a maker-only requirement. So the single `kyc_ok` flag governs two
 * things at once: whether an order can be placed, and how far maker onboarding has got.
 */
export function KycProvider({ identity, children }: { identity: string; children: React.ReactNode }) {
  /* Only poll while something is awaiting review.

     Approval happens ten seconds later on a timer (a human in production), and nothing pushes that result to
     this page -- with the event stream broken, or never connected, the person sits on "received, under review"
     forever while the database has said approved all along.

     The LIVE_EVENT below is the proper path; this one is the fallback for when it breaks. The comment here
     always claimed "the polling above is the fallback", but there never was any polling above -- this adds it.

     No polling when nothing is pending: for the vast majority of the time nothing on this page is under
     review, and asking "any change?" every four seconds is asking a question whose answer never changes. */
  const [waiting, setWaiting] = useState(false)
  const { data: app, reload } = useApi(
    () => ep.makerApp(identity), [identity], waiting ? 4000 : undefined)
  useEffect(() => {
    setWaiting(!!app && ((app.kyc_done && !app.kyc_ok) || (app.listing_done && !app.approved)))
  }, [app])
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState<'trade' | 'maker'>('trade')
  /* The "why you need to verify" line has already been said. This used to collapse it by switching why to
     maker -- with the side effect that what is said after approval changed too: someone who only wanted to
     place an order was told "next, configure what you sell". The reference keeps these two apart (KYC_AFTER). */
  const [explained, setExplained] = useState(false)

  /* After the documents go in, approval is a state the backend changes a few seconds later -- without asking,
     it shows "under review" forever and the only recourse is refreshing the page. So ask during the window
     while review is pending.

     Only while pending, and it stops after a while: in real terms review is a human looking at documents and
     may take hours, and hammering the backend once a second then is pointless. Stopping does not wedge
     anything -- reopening this card or refreshing the page fetches again. */
  /* That poll is the useApi one above (4s while `waiting`, which is this same
     condition). There used to be a second timer here asking every 1.5s for a
     minute on top of it — two pollers for one question, and this one kept
     going in a background tab, which useApi's poll already knows not to do. */

  /* A review landing on the server is an event, not something this page
     discovers by asking. The poll above is a backstop for a dropped stream. */
  useEffect(() => {
    const on = (e: Event) => {
      const ev = (e as CustomEvent<LivePayload>).detail
      if (ev?.kind === 'maker') reload()
    }
    addEventListener(LIVE_EVENT, on)
    return () => removeEventListener(LIVE_EVENT, on)
  }, [reload])

  const require = useCallback(() => {
    if (app?.kyc_ok) return false
    setWhy('trade')
    setExplained(false)
    setOpen(true)
    return true
  }, [app])

  /* The card lives in the home page's conversation area, so take the person back to home before opening it --
     otherwise clicking Verify on Discover shows nothing at all. */
  /* Whether each of the two form sections is open. These two states used to live inside MakerThread, and the
     outside could only poke at them from a distance through a counter; lifted up here, the to-do strip above
     the input and the button in the conversation read the same state -- the to-do strip should go quiet once
     the form is laid out, and it has to be able to see that.
     The counter is then unnecessary: there is one copy of the state, and setting true means open. */
  const [toListing, setToListing] = useState(false)
  const [toOffer, setToOffer] = useState(false)
  const openMaker = useCallback((intent?: 'listing' | 'offer') => {
    go({ view: 'home' }); setWhy('maker'); setOpen(true)
    if (intent === 'listing') setToListing(true)
    if (intent === 'offer') setToOffer(true)
  }, [])
  const closeMaker = useCallback(() => setOpen(false), [])

  const showMaker = open && (why !== 'trade' || explained || !!app?.kyc_done)

  const value = useMemo(() => ({
    require, openMaker, closeMaker,
    kycOk: !!app?.kyc_ok,
    kycPending: !!app?.kyc_done && !app?.kyc_ok,
    app: app ?? null,
    maker: showMaker ? (
      /* Do not close after submitting: receipt, under review and approved messages are appended below. Closing
         outright leaves a blank screen, and people assume the submission failed. */
      <MakerThread app={app ?? null} identity={identity} from={why}
        toListing={toListing} toOffer={toOffer}
        setToListing={setToListing} setToOffer={setToOffer} onDone={reload} />
    ) : null,
  }), [require, openMaker, closeMaker, app, showMaker, identity, why, reload,
    toListing, toOffer])

  return (
    <KycCtx.Provider value={value}>
      {children}
      {/* Do not drop people silently into a form: explain why verification is needed first, and go in once they
          have agreed. A navigation is not an explanation. This layer is still a modal, as it is in the reference. */}
      {open && why === 'trade' && !explained && !app?.kyc_done && (
        <Explain onClose={() => setOpen(false)}
          onGo={() => { go({ view: 'home' }); setExplained(true) }} />
      )}
    </KycCtx.Provider>
  )
}

function Explain({ onClose, onGo }: { onClose: () => void; onGo: () => void }) {
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* msq is the narrow centred layout the reference reserves for "one sentence plus one action" dialogs,
          paired with that sqi icon block. This used to use mcard alone, leaving the text left-aligned with no
          icon, visibly different from the reference. */}
      <div className="mcard msq">
        <header className="mhead">
          <h3>Verify your identity</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <div className="sqi">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2.6 4.6 5.6v5.5c0 4.4 3 8.5 7.4 9.8 4.4-1.3 7.4-5.4 7.4-9.8V5.6Z" />
              <circle cx="12" cy="10" r="2.4" />
              <path d="M8.4 16.4a4 4 0 0 1 7.2 0" />
            </svg>
          </div>
          <p className="acnote">
            A one-time check before your first trade — the fiat leg goes bank to bank,
            so the payer has to be identifiable.
          </p>
          <div className="dfoot">
            <button className="btn btn-primary" onClick={onGo}>Verify identity →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
