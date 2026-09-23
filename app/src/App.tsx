import { useEffect, useState } from 'react'
import { openEventStream } from './api/events'
import RightPanel from './components/RightPanel'
import Sidebar from './components/Sidebar'
import MobileBar from './components/MobileBar'
import { useIsMobile } from './hooks/useMedia'
import Home from './views/Home'
import Contacts from './views/Contacts'
import Thread from './views/Thread'
import Payments from './views/Payments'
import Pool from './views/Pool'
import OrderDetail from './views/OrderDetail'
import Account from './views/Account'
import Settings from './views/Settings'
import { IDENTITY_GONE } from './api/client'
import { IPanel } from './components/icons'
import { LockScreen, PwSetup, useSessionLock } from './components/SessionLock'
import { AssessmentProvider } from './hooks/useAssessment'
import { KycProvider } from './hooks/useKycGate'
import { ToastProvider } from './components/Toast'
import LiveToasts from './components/LiveToasts'
import Tooltip from './components/Tooltip'
import { useIdentity } from './hooks/useIdentity'
import { usePrivy } from '@privy-io/react-auth'
import { usePrivyAuth } from './hooks/usePrivyAuth'
import { go, useRoute } from './hooks/useRoute'

/**
 * Three-column skeleton, structurally identical to console.html's <main>:
 * #left nav / #mid the single work surface / #right assessment and order status.
 *
 * The stylesheet uses id selectors, so the ids here are not decorative -- rename one and the styles are gone.
 */
export default function App() {
  const { handle, signed, signIn, signOut } = useIdentity()
  const { login, signOutAll } = usePrivyAuth(signed, signIn)
  const { route } = useRoute()
  /* The right column was collapsed by the user -- tracked separately from "this view never had a right
     column" (rout), otherwise switching from Discover back to a new order makes the right column
     inexplicably vanish.
     Same storage key as console.html: collapse it there and it is still collapsed here. */
  const [rfold, setRfold] = useState(
    () => { try { return localStorage.getItem('atara-rfold') === '1' } catch { return false } })
  /* Session lock. The password only unlocks this UI, it approves nothing -- transfers and allowances
     always go through a signature on the wallet side. If no password was ever set, take them to set one
     first and lock for them afterwards, so the intent behind that click is not lost. */
  /* With a passkey there is no need for a password: that key opens it once locked. */
  const { user: privyUser, ready: privyReady } = usePrivy()
  /* null until Privy has loaded: the lock screen must not conclude "no passkey"
     from an account that simply has not arrived yet. */
  const hasPasskey = privyReady
    ? (privyUser?.linkedAccounts ?? []).some(a => a.type === 'passkey')
    : null
  const lk = useSessionLock(signed, hasPasskey)
  /* Phone width gets its own flag rather than reusing `folded`.
     `folded` means "collapsed to the 68px icon rail" and is persisted, so a drawer built on it would reopen itself
     on every load and would inherit whatever the user last chose on a desktop. A drawer has to start closed and
     stay out of localStorage. */
  const mobile = useIsMobile()
  const [drawer, setDrawer] = useState(false)
  /* Leaving phone width with the drawer still open would strand the class on a layout that no longer has one. */
  useEffect(() => { if (!mobile) setDrawer(false) }, [mobile])
  const [folded, setFolded] = useState(
    () => { try { return localStorage.getItem('atara-left') === '1' } catch { return false } })

  /* One live stream for the whole app, opened once signed in.
   *
   * Here rather than in the components that care, because it is one connection
   * per browser, not per view: HTTP/1.1 allows six to an origin and a stream
   * holds one for as long as it is open. Views listen for LIVE_CHANGED instead.
   *
   * Reopened on sign-in and closed on sign-out — the stream is per account, and
   * leaving the previous one running would feed the next person's screen. */
  useEffect(() => {
    if (!signed) return
    return openEventStream()
  }, [signed])

  /* After the backend swaps databases, or the account is deleted, the identity stored locally points at
     someone who does not exist. Every request is then a 401 -- fall back to signed out and show the door,
     rather than letting the UI retry forever. */
  useEffect(() => {
    const gone = () => { signOutAll(signOut); login() }
    addEventListener(IDENTITY_GONE, gone)
    return () => removeEventListener(IDENTITY_GONE, gone)
  }, [signOut, signOutAll, login])

  /* Signed out is not a blank screen: the hall renders as usual, the personal area (conversation list,
     right column) collapses, and the sign-in door only appears on the first action. The CSS keys off :root[data-locked]. */
  useEffect(() => {
    if (signed) delete document.documentElement.dataset.locked
    else document.documentElement.dataset.locked = '1'
  }, [signed])

  /* The collapsed state is recorded on <main class="lout"> -- that is what the reference does, and the
     whole collapsed style set (68px icon rail, hidden labels, logo turning into an expand button) hangs
     off main.lout. This used to write lfolded on documentElement, a class that does not exist anywhere in
     the stylesheet, so clicking the button did nothing at all. */
  useEffect(() => {
    try { localStorage.setItem('atara-left', folded ? '1' : '0') } catch { /* private window */ }
  }, [folded])
  useEffect(() => {
    try { localStorage.setItem('atara-rfold', rfold ? '1' : '0') } catch { /* private window */ }
  }, [rfold])

  return (
    /* Toast sits at the outermost layer: any action in any layer may need to say something, and wrapped
       further in, whatever happens in an outer layer would have nowhere to say it. */
    <ToastProvider>
    <LiveToasts />
    <AssessmentProvider>
    <KycProvider identity={handle}>
    {/* The right column belongs to "the two views that have a conversation": a new order, and someone's thread.
    
        The reference does main.classList.toggle('rout', v!=='chat') -- it only has one chat view, with the
        composer and the conversation both inside it. We split that into home and thread, so the condition
        has to be the union of the two. It used to test home only, so after clicking Buy in the hall and
        landing in a conversation, rout squeezed the right column down to 1px and not a word of that order's
        seven-vote consensus was visible.
    
        Other views collapse it so the middle column gets the whole remaining width; .view's max-width:960px
        + align-self:center only take effect then, centring the cards. */}
    <main className={[(route.view === 'home' || route.view === 'thread') && signed
      /* `lout` is the 68px icon rail, and 28 rules hang off it: centred icons, font-size:0 on every label,
         the conversation list stripped to bare avatars. None of that means anything for a drawer, which is
         either open at full width or not there -- but `folded` is persisted, so anyone who had collapsed the
         column on a desktop got a label-less drawer on their phone. Withheld at this width rather than undone
         rule by rule, which would also have to be redone for every rule added later. */
      ? '' : 'rout', !mobile && folded ? 'lout' : '',
      rfold ? 'rfold' : '', drawer ? 'drawer' : ''].filter(Boolean).join(' ') || undefined}>
      {mobile && <MobileBar route={route} onMenu={() => setDrawer(true)} />}
      {/* Tapping away closes the drawer. A real element rather than a ::backdrop so it can be the thing that catches
          the tap, and it stays in the tree at every width so the fade has something to animate. */}
      <button className="mscrim" type="button" tabIndex={drawer ? 0 : -1} aria-hidden={!drawer}
        aria-label="Close navigation" onClick={() => setDrawer(false)} />
      <Sidebar route={route} go={go} identity={handle} folded={folded} onFold={setFolded}
        onNavigate={() => setDrawer(false)}
        signed={signed} onSignIn={login}
        onSignOut={() => { signOutAll(signOut); go({ view: 'discover' }) }}
        onLock={lk.lock} />

      <section id="mid">
        {/* The starting point when signed out is the market: what there is to look at is here, and the order page is for after sign-in */}
        {route.view === 'home' && (signed
          ? <Home identity={handle} />
          : <Pool identity={handle} onNeedSignIn={login} />)}
        {route.view === 'discover' && (
          <Pool identity={handle} onNeedSignIn={signed ? undefined : login} />
        )}
        {route.view === 'contacts' && <Contacts identity={handle} />}
        {route.view === 'payments' && <Payments identity={handle} />}
        {route.view === 'account' && <Account identity={handle} />}
        {route.view === 'settings' && <Settings identity={handle} />}
        {route.view === 'order' && (
          <div className="view on"><div className="vbody">
            <OrderDetail id={route.id} identity={handle} onBack={() => go({ view: 'payments' })} />
          </div></div>
        )}
        {route.view === 'thread' && <Thread identity={handle} peer={route.peer} />}
      </section>

      {/* Not display:none -- mounting it would start its polling and render the whole assessment tree for a column
          nobody can see. The assessment itself is reachable in the conversation flow; order status has its own page
          at #/payments. */}
      {!mobile && <RightPanel identity={handle}
        /* Orders with no counterparty (not yet matched) can only go to the ticket page -- there is no conversation to enter. */
        onOpen={o => (o.counterparty_id
          ? go({ view: 'thread', peer: o.counterparty_id })
          : go({ view: 'order', id: o.id }))}
        onFold={() => setRfold(true)} />}

      {/* It has to be restorable once collapsed. This button only appears when "the user collapsed it and
          this view has a right column in the first place" -- offering an expand button on a view that never
          had one leaves a button that does nothing when clicked.

          The condition must use the same union (home + thread) as the rout test on main above.
          This used to test home only: collapse the right column on the home page, then walk into someone's
          conversation, and the right column was still collapsed there while this reopen button was judged
          away -- leaving no entry point anywhere in the conversation page to bring it back, short of going
          back to home, expanding, and walking in again. */}
      <button className="rshow" type="button" title="Show panel" aria-label="Show panel"
        hidden={mobile || !rfold || !((route.view === 'home' || route.view === 'thread') && signed)}
        onClick={() => setRfold(false)}>
        <IPanel mirror />
      </button>
      {/* The sign-in dialog is rendered by Privy itself and mounted on body -- no space needs reserving here */}
    </main>

    {lk.setup && (
      <PwSetup why={lk.setup.why} onClose={lk.closeSetup} onDone={lk.finishSetup} />
    )}
    {lk.locked && (
      <LockScreen hasPasskey={hasPasskey}
        onUnlock={() => lk.setLocked(false)}
        onSignOut={() => { lk.setLocked(false); signOutAll(signOut); go({ view: 'discover' }) }} />
    )}
    </KycProvider>
    </AssessmentProvider>
    {/* Mounting it once is enough: it takes over title globally through event delegation and does not need to wrap anything. */}
    <Tooltip />
    </ToastProvider>
  )
}
