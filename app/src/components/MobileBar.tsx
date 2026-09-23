import { IMenu } from './icons'
import type { Route } from '../hooks/useRoute'

/**
 * The phone-width top bar: open the drawer, and say where you are.
 *
 * It exists because the left column stops being visible at this width -- without it there is no way back to
 * navigation and no indication of which view you are on. Desktop never sees it (`display:none` above the
 * breakpoint), so it adds nothing to the three-column layout.
 *
 * Deliberately only two things. The account cell, the conversation list and sign-in all stay inside the drawer
 * where they already live: duplicating an entry point here would mean two places to keep in sync, and the bar
 * has to leave the view's own header room to breathe.
 */
export default function MobileBar({ route, onMenu }: { route: Route; onMenu: () => void }) {
  return (
    <header className="mbar">
      <button className="mbarb" type="button" onClick={onMenu}
        aria-label="Open navigation"><IMenu /></button>
      <b className="mbart">{title(route)}</b>
    </header>
  )
}

/* Titles match the sidebar's own labels (Sidebar.tsx NAVS) so the bar and the drawer never name the same place
   differently. thread has no name here -- the peer's name lives in the thread header, which is right below. */
function title(r: Route): string {
  switch (r.view) {
    case 'home': return 'New order'
    case 'discover': return 'Discover'
    case 'contacts': return 'Contacts'
    case 'payments': return 'Payments'
    case 'account': return 'Profile'
    case 'settings': return 'Settings'
    case 'order': return 'Order'
    case 'thread': return 'Conversation'
    default: return 'Atara'
  }
}
