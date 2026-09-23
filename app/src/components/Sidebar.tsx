import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { PROFILE_CHANGED } from '../api/client'
import { LIVE_CHANGED } from '../api/events'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import { IApi, IChart, IContacts, IDiscover, IGear, IGo, ILock, INewOrder, IPanel, IPayments } from './icons'
import { useKycGate } from '../hooks/useKycGate'
import type { Icon } from './icons'
import { NEW_ORDER, OPEN_DESK, setDeskOpen, type Route } from '../hooks/useRoute'

/** Four nav items plus two external links, in the same order as console.html. */
const NAVS: { view: Route['view']; label: string; icon: Icon }[] = [
  { view: 'home', label: 'New order', icon: INewOrder },
  { view: 'discover', label: 'Discover', icon: IDiscover },
  { view: 'contacts', label: 'Contacts', icon: IContacts },
  { view: 'payments', label: 'Payments', icon: IPayments },
]

export default function Sidebar({
  route, go: navigate, identity, folded, onFold, signed, onSignIn, onSignOut, onLock, onNavigate,
}: {
  route: Route
  go: (r: Route) => void
  identity: string
  folded: boolean
  onFold: (v: boolean) => void
  signed: boolean
  onSignIn: () => void
  onSignOut: () => void
  onLock: () => void
  /** Phone width only: the drawer has to shut once you have gone somewhere. Absent on desktop, where the column is always in view. */
  onNavigate?: () => void
}) {
  /* Wrapped once here rather than at each call site: every navigation in this column -- nav items, conversation
     rows, the Atara AI row, the account menu -- should close the drawer, and threading a second call through all
     of them is how one gets forgotten. */
  const go = (r: Route) => { navigate(r); onNavigate?.() }
  const [menu, setMenu] = useState(false)
  const kyc = useKycGate()
  const row = useRef<HTMLDivElement>(null)

  /* Opens on hover, no click needed.
   *
   * The menu is a child of .luserrow (the CSS positions it absolutely against this cell), so moving the mouse
   * from this cell onto the menu does not fire leave -- there is no gap to cross in between, and no delay is
   * needed for that. The 120ms here only guards against edge jitter: tracing the border fires several
   * enter/leave pairs in a row, and without a buffer the menu flickers.
   *
   * Mouse only: on a touch screen a tap first sends pointerenter, opening the menu, and the click right after
   * toggles it back shut -- net effect, "tapping does nothing". That path is left to the onClick below. */
  const shut = useRef(0)
  const hoverIn = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !signed) return
    clearTimeout(shut.current)
    setMenu(true)
  }
  const hoverOut = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(shut.current)
    shut.current = window.setTimeout(() => setMenu(false), 120)
  }
  useEffect(() => () => clearTimeout(shut.current), [])

  // Close the menu on outside click or Esc
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => { if (!row.current?.contains(e.target as Node)) setMenu(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    const t = setTimeout(() => addEventListener('pointerdown', away), 0)
    addEventListener('keydown', key)
    return () => { clearTimeout(t); removeEventListener('pointerdown', away); removeEventListener('keydown', key) }
  }, [menu])
  const { data: me, reload: reloadMe } = useApi(() => ep.me(identity), [identity])
  const { data: allow, reload: reloadAllow } = useApi(() => ep.allowances(identity), [identity])
  // The conversation list is the lower half of the left column. With no conversations the whole block
  // (heading included) is absent -- an empty heading suggests a failed load more than no heading does.
  /* Polling: the conversation list has to follow two things -- an order I just placed opens a new conversation,
     and a message from the other side bumps an old one. Without polling, placing an order lands in the chat while
     the left column has no row for it until the whole page is reloaded; the same when the other side speaks, and
     nothing happens at all, quietly. */
  /* 15s as a backstop; LIVE_CHANGED below is what normally refreshes this. */
  const { data: feed, reload: reloadFeed } = useApi(() => ep.threads(identity), [identity], 15000)

  useEffect(() => {
    addEventListener(LIVE_CHANGED, reloadFeed)
    return () => removeEventListener(LIVE_CHANGED, reloadFeed)
  }, [reloadFeed])
  const threads = feed?.list
  /* People waiting for me to accept them. Rendered on the Contacts row so the
     request is visible from anywhere — until now it was only discoverable by
     opening the Contacts page, which is the one place you go when you already
     know there is something there. */
  const pending = feed?.pending ?? 0

  /* A rename has to show immediately. This /me belongs to the left column, while the account page reloads its own
     copy -- without listening to this broadcast, the bottom left stays on the pre-rename value: for a new account
     that is a string of address, when the user has just given themselves a name. */
  useEffect(() => {
    const again = () => { reloadMe(); reloadAllow() }
    addEventListener(PROFILE_CHANGED, again)
    return () => removeEventListener(PROFILE_CHANGED, again)
  }, [reloadMe, reloadAllow])

  const addr = me?.address ?? ''
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
  /* A newly created wallet has no name, so the backend uses the short address as the display name -- appending the
     address again then produces "Tc72vq...tnhc - Tc72vq...tnhc". No repetition when the name is the address. */
  const named = !!me?.display_name && me.display_name !== short
  /* The initial for the avatar. Falls back to the address, never to a letter
     that stands for a name nobody has — a profile that failed to load should
     look unloaded, not like somebody else's account. */
  const initial = (me?.display_name || addr || '·').charAt(0).toUpperCase()
  /* Strip the Atara AI thread out of the list: there is already a permanent entry row for it below.
     desk is now a real agent account in the database (messages.peer_id needs a foreign key), so once you have
     spoken to it, a row with the same name appears automatically in the conversation list -- the same conversation
     twice in the sidebar, either of which works, but it looks like there are two. */
  const chats = (threads ?? []).filter(t => t.peer_id !== ep.DESK_ID)

  return (
    <nav id="left" aria-label="Navigation">
      <div className="lbrandrow">
        {/* Collapsed: the logo's position is the expand button */}
        <button className="lfold" title="Expand sidebar" aria-label="Expand sidebar"
          aria-expanded={!folded} onClick={() => onFold(false)}>
          <span className="lmark" aria-hidden><i /></span>
          <span className="lfi"><IPanel /></span>
        </button>
        {/* Site root, not '../index.html'. A relative path assumes the console is exactly one level deep -- which it
            currently is, under /app, but that is a deployment layout, not something this component knows; move it one
            directory and this quietly points somewhere else. '/' is always the landing page. */}
        <a className="lbrand" href="/" aria-label="Back to site">
          <span className="lmark" aria-hidden><i /></span><b>Atara</b>
        </a>
        <button className="sayic lfoldx" title="Collapse sidebar" aria-label="Collapse sidebar"
          aria-expanded={!folded} onClick={() => onFold(true)}><IPanel /></button>
      </div>

      <div className="lpane" id="lp-ai">
        <div className="navs">
          {NAVS.map(n => {
            const Icon = n.icon
            return (
              <button key={n.view} className={'nav' + (route.view === n.view ? ' on' : '')}
                title={n.label}
                /* While signed out, everything but Discover requires signing in first. Clicking New order used to
                   land on Discover -- a side effect of the "signed out starts at the market" rule, but from the
                   user's side it is "I clicked A and you gave me B". Open the sign-in door directly. */
                onClick={() => {
                  if (!signed && n.view !== 'discover') { onSignIn(); return }
                  /* "New order" means opening a fresh desk: the onboarding conversation has to collapse first, or
                     clicking it leaves the same string of messages on screen and looks like nothing happened.
                     It is reachable again -- Atara AI under Chats is always there.

                     NEW_ORDER has to be shouted too: assessment state hangs off an App-level provider and stays
                     alive across views, and when the person is already on the home page this button changes no
                     route and does not remount Home -- so the previous order's assessment trace would stay on the
                     new desk. */
                  if (n.view === 'home') {
                    kyc.closeMaker()
                    /* Both are needed: the variable covers the "home is not mounted yet" path (arriving from another
                       view, where the listener does not exist when the event fires and it is simply dropped), and the
                       event covers the "already on home" path (no route change, no remount, only an event gets through). */
                    setDeskOpen(false)
                    dispatchEvent(new CustomEvent(NEW_ORDER))
                  }
                  go({ view: n.view } as Route)
                }}>
                <span className="ni"><Icon /></span>{n.label}
                {/* Empty string when there is nothing waiting: `.c.dot:empty`
                    hides it, so no conditional is needed and the markup stays
                    the same shape in both states. */}
                {n.view === 'contacts' && (
                  <span className="c dot num"
                    aria-label={pending ? `${pending} waiting to connect` : undefined}>
                    {pending ? (pending > 99 ? '99+' : pending) : ''}
                  </span>
                )}
              </button>
            )
          })}
          <div className="navsep" aria-hidden />
          {/* Points at the copy on the public site, matching the old deployment. The reference writes a relative path,
              href="api.html" -- because console.html was hosted on loka.cash at the time, so a relative path landed on
              the same origin. Once the console moved to its own server, the relative path no longer reached that
              document, hence the absolute address here. */}
          <a className="nav" id="navapi" href="https://www.loka.cash/api.html"
            target="_blank" rel="noopener"
            title="Atara API — developer reference">
            <span className="ni"><IApi /></span>Atara API
            <span className="navgo" aria-hidden><IGo /></span>
          </a>
          {/* The same multi-agent debate applied to a different judgement: there it rates a stock, here a counterparty */}
          <a className="nav" id="navloka" href="https://trade.loka.cash/app" target="_blank"
            rel="noopener" title="Investment Analysis — multi-agent research">
            <span className="ni"><IChart /></span>Investment Analysis
            <span className="navgo" aria-hidden><IGo /></span>
          </a>
        </div>

        <div className="lsec" id="tasksec" hidden={!signed}>Chats</div>
        <div id="tasklist">
          {/* Atara AI is the permanent first conversation -- onboarding, review and the rest all happen inside it.
              In the reference it is always in the list; we used to show a heading only temporarily while the wizard
              was open, so once the flow was done there was no way back and "where has my application got to" had no entry point. */}
          {signed && (
            <button className={'cp chatrow' + (route.view === 'home' ? ' on' : '')} title="Atara AI"
              onClick={() => {
                /* The opposite of New order: this entry point means "I want to see that conversation".
                   Both are sent here too, for the reason in the comment above. */
                setDeskOpen(true)
                dispatchEvent(new CustomEvent(OPEN_DESK))
                go({ view: 'home' })
                kyc.openMaker()
              }}>
              <span className="cpav deskav" aria-hidden><i /></span>
              {/* In the reference this row carries only the name. The small line on other conversations is "last
                  message", and a fixed subtitle here would squeeze the name into truncation. */}
              <span className="n"><em>Atara AI</em></span>
            </button>
          )}
          {chats.map(t => (
            /* chatrow is not decorative: the avatar rule is `#tasklist .chatrow .cpav`, and without this class name the
               selector does not match and the avatar falls back to .cpav's 20px -- whereas the design is 34px here.
               The rule that hides names when the sidebar is collapsed hangs off it too.
               The CSS was copied from the reference while the JSX did not bring across the structure the selectors
               require, so the styles silently failed to apply. */
            <button key={t.peer_id} className="cp chatrow" title={t.peer_name}
              onClick={() => go({ view: 'thread', peer: t.peer_id })}>
              <Avatar name={t.peer_name} cls="cpav" />
              <span className="n">
                <em>{t.peer_name}</em>
                <i>{t.last}</i>
              </span>
              {/* .cpt does not exist in either stylesheet, so this time has always been unstyled bare text.
                  The reference uses .chmeta wrapping a <time>, with the unread badge in the same cell. */}
              <span className="chmeta">
                <time>{fmtClock(t.last_at)}</time>
                {/* The badge prints a count rather than a dot: "there are new messages" and "seven have piled up unread"
                    are two different things, and only the latter makes someone decide to open it now.
                    With the sidebar collapsed the CSS turns it into a dot on the avatar's corner (.chatrow:has(.unread)). */}
                {!!t.unread && t.unread > 0 && (
                  <span className="v dot unread num"
                    aria-label={`${t.unread} unread`}>{t.unread > 99 ? '99+' : t.unread}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* While signed out the account cell is the sign-in entry point -- that cell is about "who you are" anyway;
          signed in, it is the account menu, and sign out lives here too. */}
      <div className="luserrow" ref={row}
        onPointerEnter={hoverIn} onPointerLeave={hoverOut}>
        <button className="luser" aria-haspopup="menu" aria-expanded={menu}
          onClick={() => (signed ? setMenu(m => !m) : onSignIn())}>
          <span className="lav">{signed ? initial : '+'}</span>
          <span className="lutxt">
            {signed ? (
              <>
                <em className="lun">{named ? `${me!.display_name} · ${short}` : short}</em>
                <em className="lsub">
                  Personal account · <span className="num">{allow?.length ?? 0}</span> allowances
                </em>
              </>
            ) : <em className="lun">Sign in</em>}
          </span>
        </button>

        {menu && signed && (
          <div className="ddmenu umenu" role="menu"
            style={{ left: folded ? 10 : 8, bottom: 'calc(100% - 6px)' }}>
            <div className="umhead">
              <span className="umav">{initial}</span>
              {/* No invented name here either: without a profile this shows the
                  address, which is at least true. Printing "Demo" turned a
                  failed request into a claim about who you are — and it looked
                  convincing enough that it read as the seeded demo account. */}
              <span><b>{me?.display_name || short || 'Signed in'}</b>
                <em className="num">{short}</em></span>
            </div>
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); go({ view: 'account' }) }}>
              <IUser />Profile
            </button>
            {/* In the reference, Settings switches to another mode of the account page (ACCT_MODE) and shows only the
                Security section. This used to jump straight to the account page -- that was not "not working", it was
                treating two things as one: the account page is assets and listings, security settings are a different matter. */}
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); go({ view: 'settings' }) }}>
              <IGear />Settings
            </button>
            <div className="umsep" />
            {/* Lock screen: cover the UI, requiring a click to come back. The reference also carries a demo password,
                which is a demo artefact -- no fake credential check is done here, only the "left the desk" part. */}
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); onLock() }}>
              <ILock />Lock session
            </button>
            {/* Sign out = back to the signed-out console: look but do not touch.
                The backend has no session to invalidate -- what is cleared here is the local identity selection. */}
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); onSignOut() }}>
              <IOut />Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

const IUser = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8" cy="5" r="2.6" /><path d="M2.8 13.5a5.2 5.2 0 0 1 10.4 0" /></svg>
)
const IOut = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H10" />
    <path d="M7 8h7M11.5 5.5 14 8l-2.5 2.5" /></svg>
)

/** The conversation row's top right shows only hours and minutes -- the date is inside the conversation and is not repeated in the list. */
function fmtClock(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
