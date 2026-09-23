import { useCallback, useEffect, useRef, useState } from 'react'
import { useMe } from '../hooks/useMe'
import { IEye, IEyeOff, ILock } from './icons'

/**
 * Session lock.
 *
 * The console lays out balances, counterparties and documents, and most people use it on a shared office
 * screen, so leaving the desk needs an action, and idling has to lock by itself.
 *
 * The password does exactly one thing: unlock this UI. **It approves nothing** -- transfers and allowances
 * always go through a signature on the wallet side. A demo artefact: it only ever lives in this browser tab
 * and never leaves the machine.
 */

const PW_KEY = 'atara-pw'
/* Both live in sessionStorage next to the signed-in flag: a reload keeps the
   session, so it has to keep the lock too. */
const LOCK_KEY = 'atara-locked'
const ACTIVE_KEY = 'atara-last-active'

/** Demo switch: ?lock=20 drops the idle threshold to 20 seconds so the lock can be watched happening. */
export const LOCK_IDLE = (() => {
  const q = Number(new URLSearchParams(location.search).get('lock') || 0)
  return q > 0 ? q * 1000 : 15 * 60 * 1000
})()

export function readPw(): string {
  try { return sessionStorage.getItem(PW_KEY) || '' } catch { return '' }
}
function writePw(v: string) {
  try { sessionStorage.setItem(PW_KEY, v) } catch { /* private window */ }
}

/**
 * Idle timer. Any real interaction re-arms it; it does not run while locked.
 *
 * The last interaction is also stamped into sessionStorage (at most once every
 * few seconds — wheel events fire continuously) so that a tab reloaded or
 * restored after sitting idle comes back locked rather than open.
 */
export function useIdleLock(enabled: boolean, onIdle: () => void) {
  const cb = useRef(onIdle)
  cb.current = onIdle
  useEffect(() => {
    if (!enabled) return
    let t = window.setTimeout(() => cb.current(), LOCK_IDLE)
    let stamped = 0
    const stamp = () => {
      const now = Date.now()
      if (now - stamped < 5000) return
      stamped = now
      try { sessionStorage.setItem(ACTIVE_KEY, String(now)) } catch { /* private window */ }
    }
    stamp()
    const arm = () => { clearTimeout(t); t = window.setTimeout(() => cb.current(), LOCK_IDLE); stamp() }
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    evs.forEach(e => addEventListener(e, arm, { passive: true }))
    return () => {
      clearTimeout(t)
      evs.forEach(e => removeEventListener(e, arm))
    }
  }, [enabled])
}

/**
 * A password field with a reveal toggle.
 *
 * The product had no toggle of its own, so what people saw was whatever the browser drew: Edge paints
 * ::-ms-reveal inside the field, and only while the field holds text -- which is why it kept appearing and
 * vanishing -- while Chrome, Firefox, Safari and every phone browser but Edge paint nothing. A field you
 * cannot read back is worst exactly where it is hardest to type, so the control is drawn here instead and
 * the native one is hidden in CSS.
 *
 * The button is 44px square against a 44px field, so it is a comfortable target without a mobile-only rule.
 * mousedown is suppressed so that revealing does not take the caret out of the field mid-word; tabbing to
 * it still works.
 */
function PwField({ shake, ...rest }: { shake?: boolean }
  & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className={'pwfield' + (shake ? ' shake' : '')}>
      <input {...rest} type={show ? 'text' : 'password'} className="pwin" autoComplete="off" />
      <button type="button" className="pweye" aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
        onMouseDown={e => e.preventDefault()}
        onClick={() => setShow(v => !v)}>
        {show ? <IEyeOff size={16} /> : <IEye size={16} />}
      </button>
    </div>
  )
}

// -- Set password -------------------------------------------------------

export function PwSetup({
  why, onClose, onDone,
}: { why?: string; onClose: () => void; onDone: () => void }) {
  const had = readPw()
  const [old, setOld] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')

  const save = () => {
    if (had && old !== had) { setErr('Current password does not match'); return }
    if (a.length < 4) { setErr('Use at least 4 characters'); return }
    if (a !== b) { setErr('The two entries do not match'); return }
    writePw(a)
    onDone()
  }

  return (
    <div className="pwmask" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pwsheet" role="dialog" aria-modal="true" aria-label="Session lock password">
        <h3>{had ? 'Change lock password' : 'Set a lock password'}</h3>
        {why ? <p className="pwwhy">{why}</p> : null}
        {/* Copy taken verbatim from the reference's openPwSetup, not reworded. */}
        <p>
          It unlocks this console when the session locks — it does not approve anything.
          Transfers and allowances always go through your passkey. Demo only: it stays in
          this browser tab and is never sent anywhere.
        </p>
        {had && (
          <PwField placeholder="Current password"
            value={old} onChange={e => { setOld(e.target.value); setErr('') }} />
        )}
        <PwField autoFocus placeholder={had ? 'New password' : 'Lock password'}
          value={a} onChange={e => { setA(e.target.value); setErr('') }} />
        <PwField placeholder="Repeat it"
          value={b} onChange={e => { setB(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') save() }} />
        <div className="pwerr">{err}</div>
        <div className="pwrow">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{had ? 'Change' : 'Set password'}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Have the user prove "it is me" with a passkey.
 *
 * This goes through the browser's native WebAuthn, not Privy's MFA -- the latter is for transactions and is
 * initiated by Privy when it needs it, so it cannot be called on its own to open a door in the UI.
 *
 * No allowCredentials: let the browser list every discoverable passkey on this origin. linkPasskey() runs
 * inside our own page, so that key is bound to this origin.
 *
 * There is **no** server-side verification here; the assertion result is only used to release the session
 * lock. That proportion is deliberate: the session lock guards against "someone left the desk with the
 * screen on", not against "someone with devtools". The steps that actually move money each have their own
 * confirmation and do not rely on this door.
 */
export async function assertPasskey(): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const cred = await navigator.credentials.get({
    publicKey: { challenge, userVerification: 'required', timeout: 60_000 },
  })
  if (!cred) throw new Error('Passkey check was dismissed')
}

// -- Lock screen --------------------------------------------------------

export function LockScreen({
  hasPasskey, onUnlock, onSignOut,
}: {
  /**
   * Whether this account has a passkey. If so, no password is asked for — the
   * key is the stronger of the two. `null` while Privy has not answered yet:
   * after a reload this screen mounts before that, and guessing "no" would
   * flash a password field that vanishes a moment later.
   */
  hasPasskey: boolean | null
  onUnlock: () => void
  onSignOut: () => void
}) {
  /* Whose session this is. On a shared screen the person coming back may not be
     the one who left, and "Not you? Sign out" only makes sense if the screen
     says who "you" is — the same avatar and name as the sidebar, not the first
     digit of a wallet address. */
  const me = useMe()
  const addr = me?.address ?? ''
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
  const named = !!me?.display_name && me.display_name !== short
  const pw = readPw()
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  /* Which one to offer first. A passkey is more convenient, but it may not exist on this origin at all --
     see the note on byPasskey below -- so this is a fallback-able choice, not a final one. */
  /* null = not decided yet, because hasPasskey is not known yet. The choice is
     made once, from the first real answer; after that the person switches it
     with the buttons below, not Privy. */
  const [byPw, setByPw] = useState<boolean | null>(hasPasskey === null ? null : !hasPasskey)
  useEffect(() => {
    if (hasPasskey !== null) setByPw(cur => cur === null ? !hasPasskey : cur)
  }, [hasPasskey])
  const ini = (me?.display_name || addr || '·').charAt(0).toUpperCase()
  const span = LOCK_IDLE >= 60000
    ? `${Math.round(LOCK_IDLE / 60000)} minutes`
    : `${Math.round(LOCK_IDLE / 1000)} seconds`

  const byPasskey = async () => {
    setBusy(true); setErr('')
    try {
      await assertPasskey()
      onUnlock()
    } catch (e) {
      /* On failure fall back to the password; do not lock the person out.

         hasPasskey reads the one registered on the Privy account, whereas a WebAuthn key is **bound to the
         origin**. Move the same account to a different deployment address -- localhost, an IP, vercel.app,
         your own domain -- and the account still says "has a passkey" while the browser can find none.
         What is left on screen is one unresponsive button and Sign out, for someone who did nothing wrong. */
      /* The browser **deliberately** reports "the user cancelled" and "there is no
         such key here" as one and the same NotAllowedError — telling them apart
         would let a page learn whether an account is registered. So both
         possibilities are named, together with the one way in that always works.
         The browser's own message stays in the console: it is a spec citation
         written for developers, not for the person at the screen. */
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      if (denied) console.warn('passkey assertion refused:', e.message)
      const why = denied
        ? 'The passkey check was cancelled, or no passkey for this account is available on this device.'
        : e instanceof Error ? e.message : 'Could not verify your passkey.'
      setErr(pw ? why : why + ' Signing out and back in will let you in.')
      if (pw) setByPw(true)
    } finally { setBusy(false) }
  }

  const submit = () => {
    if (v !== pw) {
      setErr(v ? 'Wrong password' : 'Enter your password')
      setShake(n => n + 1)
      return
    }
    setErr(''); setV(''); onUnlock()
  }

  return (
    <div id="lock" className="show" role="dialog" aria-modal="true" aria-label="Session locked">
      <div className="lksheet">
        <span className="lkav" aria-hidden>{ini}<i><ILock /></i></span>
        {(named || short) && (
          <em className="lkwho">{named ? `${me!.display_name} · ${short}` : short}</em>
        )}
        {/* The title follows what is actually on screen: with no password field, do not tell people to enter a password. */}
        <h3>{byPw ? 'Enter your password' : 'Session locked'}</h3>
        <p>
          For your security, this session locks after {span} of inactivity.
          {byPw === null ? ''
            : byPw ? ' Enter your password to continue.'
            : ' Unlock with your passkey to continue.'}
        </p>
        {byPw === null ? (
          /* Privy has not said yet how this account can unlock. Hold the sheet's
             shape with a disabled button rather than guess a field. */
          <button className="btn btn-primary lkok" disabled>Checking your account…</button>
        ) : byPw ? (
          <>
            {/* key restarts the shake animation on each wrong attempt; it sits on the wrapper so the
                reveal button moves with the field rather than standing still inside a shaking border. */}
            <PwField key={shake} shake={shake > 0}
              autoFocus aria-label="Password" value={v}
              onChange={e => { setV(e.target.value); setErr('') }}
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
            <div className="pwerr">{err}</div>
            <button className="btn btn-primary lkok" onClick={submit}>Unlock</button>
            {/* With a passkey, keep a way back: that last failure may have been nothing more than hitting cancel */}
            {hasPasskey && (
              <button className="lkalt" onClick={() => { setErr(''); setByPw(false) }}>
                Use your passkey instead
              </button>
            )}
          </>
        ) : (
          <>
            <div className="pwerr">{err}</div>
            <button className="btn btn-primary lkok" disabled={busy}
              onClick={() => void byPasskey()}>
              {busy ? 'Waiting for your passkey…' : 'Unlock with passkey'}
            </button>
            {/* This key may have been registered on a different origin and cannot be found here. With no
                password ever set there is no such path -- only Sign out remains, so the error above has to be explicit. */}
            {pw && (
              <button className="lkalt" onClick={() => { setErr(''); setByPw(true) }}>
                Use your password instead
              </button>
            )}
          </>
        )}
        {/* On a shared screen, the person coming back to the desk may not be the same one */}
        <button className="lkout" onClick={onSignOut}>Not you? Sign out</button>
      </div>
    </div>
  )
}

/**
 * Catches the intent behind "they clicked lock".
 *
 * Before locking, it has to be certain that "something can open it again", or this locks the person out.
 * Two things can open it: a passkey on the account, or a password set on this machine. With a passkey it
 * locks straight away without asking for a password as well -- that key is already stronger than a
 * password, and requiring one too is just another thing to remember.
 * Only when neither exists does it take them to set one, then lock for them afterwards, so the intent
 * behind that click is not lost.
 */
/** Was the console locked when this tab last rendered, or idle past the threshold? */
function lockedOnLoad(signed: boolean): boolean {
  if (!signed) return false
  try {
    if (sessionStorage.getItem(LOCK_KEY) === '1') return true
    const last = Number(sessionStorage.getItem(ACTIVE_KEY) || 0)
    return last > 0 && Date.now() - last > LOCK_IDLE
  } catch { return false }
}

/**
 * @param hasPasskey `null` while Privy has not yet said whether this account has
 * a passkey. Treated as "maybe": the lock is neither dropped nor refused on it.
 */
export function useSessionLock(signed: boolean, hasPasskey: boolean | null = false) {
  const [locked, setLockedState] = useState(() => lockedOnLoad(signed))
  const [setup, setSetup] = useState<{ why?: string } | null>(null)
  const canOpen = hasPasskey === null ? true : hasPasskey || !!readPw()

  /* Mirrored into sessionStorage so a reload while locked comes back locked.
     React state alone lasts exactly until F5 — the first thing a passer-by
     tries. */
  const setLocked = useCallback((v: boolean) => {
    setLockedState(v)
    try {
      if (v) sessionStorage.setItem(LOCK_KEY, '1')
      else sessionStorage.removeItem(LOCK_KEY)
    } catch { /* private window */ }
  }, [])

  const lock = useCallback(() => {
    if (!hasPasskey && !readPw()) {
      setSetup({
        why: 'Set a password first — without one, or a passkey, '
          + 'nothing could unlock the console again.',
      })
      return
    }
    setLocked(true)
  }, [hasPasskey, setLocked])

  /* A lock nothing can open is a lockout, not a lock. Once Privy has answered
     and there is neither a passkey nor a password, drop it — the same rule
     lock() applies before locking. Signing out drops it as well. */
  useEffect(() => {
    if (!locked) return
    if (!signed || (hasPasskey === false && !readPw())) setLocked(false)
  }, [locked, signed, hasPasskey, setLocked])

  useIdleLock(signed && !locked, () => { if (canOpen) setLocked(true) })

  return {
    locked, setLocked, lock,
    setup, closeSetup: () => setSetup(null),
    /* Lock as soon as the password is set — that is what the click was for. */
    finishSetup: () => { setSetup(null); setLocked(true) },
  }
}
